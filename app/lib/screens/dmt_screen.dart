import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/session.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import 'txn_result_screen.dart';

/// Domestic money transfer for a walk-in customer (the "remitter"): find or register the
/// remitter by mobile, pick or add a beneficiary bank account, send by IMPS/NEFT.
class DmtScreen extends StatefulWidget {
  const DmtScreen({super.key});

  @override
  State<DmtScreen> createState() => _DmtScreenState();
}

class _DmtScreenState extends State<DmtScreen> {
  final _mobile = TextEditingController();
  final _name = TextEditingController();
  final _amount = TextEditingController();
  Map<String, dynamic>? _remitter;
  bool _notFound = false;
  List<Map<String, dynamic>> _beneficiaries = [];
  Map<String, dynamic>? _beneficiary;
  String _mode = 'IMPS';
  // One idempotency key per payment attempt on this screen: a retry after a network
  // error reuses it, so the server never charges twice.
  final String _clientRef = newClientRef();
  bool _busy = false;
  String? _error;

  ApiClient get _api => context.read<Session>().api;

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } on PinCancelled {
      // cancelled
    } catch (e) {
      if (mounted) setState(() => _error = errorOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _search() => _run(() async {
    final res = await _api.get('/dmt/remitters/search', query: {'mobileNumber': _mobile.text.trim()});
    final r = res['remitter'] as Map<String, dynamic>?;
    setState(() {
      _remitter = r;
      _notFound = r == null;
    });
    if (r != null) await _loadBeneficiaries();
  });

  Future<void> _register() => _run(() async {
    final res = await _api.post('/dmt/remitters', {'name': _name.text.trim(), 'mobileNumber': _mobile.text.trim()});
    setState(() {
      _remitter = res['remitter'] as Map<String, dynamic>;
      _notFound = false;
    });
    await _loadBeneficiaries();
  });

  Future<void> _verify() => _run(() async {
    final res = await _api.post('/dmt/remitters/${_remitter!['id']}/verify');
    setState(() => _remitter = res['remitter'] as Map<String, dynamic>);
  });

  Future<void> _loadBeneficiaries() async {
    final res = await _api.get('/dmt/remitters/${_remitter!['id']}/beneficiaries');
    setState(() => _beneficiaries = (res['beneficiaries'] as List).cast<Map<String, dynamic>>());
  }

  Future<void> _addBeneficiary() async {
    final name = TextEditingController(), acc = TextEditingController(), ifsc = TextEditingController(), bank = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add beneficiary'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: name,
                decoration: const InputDecoration(labelText: 'Account holder name'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: acc,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Account number'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: ifsc,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(labelText: 'IFSC'),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: bank,
                decoration: const InputDecoration(labelText: 'Bank name'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Add')),
        ],
      ),
    );
    if (ok != true) return;
    await _run(() async {
      final res = await _api.post('/dmt/remitters/${_remitter!['id']}/beneficiaries', {
        'name': name.text.trim(),
        'accountNumber': acc.text.trim(),
        'ifsc': ifsc.text.trim().toUpperCase(),
        'bankName': bank.text.trim(),
      });
      await _loadBeneficiaries();
      setState(() => _beneficiary = res['beneficiary'] as Map<String, dynamic>);
    });
  }

  Future<void> _send() => _run(() async {
    final pin = await askPinIfEnabled(context);
    if (!mounted) return;
    final res = await _api.post('/dmt/transfer', {
      'remitterId': _remitter!['id'],
      'beneficiaryId': _beneficiary!['id'],
      'amount': toDouble(_amount.text),
      'mode': _mode,
      'pin': ?pin,
      'clientRef': _clientRef,
    });
    if (!mounted) return;
    await Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => TxnResultScreen(txn: res['transaction'] as Map<String, dynamic>, operatorName: 'Money Transfer ($_mode)'),
      ),
    );
  });

  @override
  Widget build(BuildContext context) {
    final verified = _remitter?['isVerified'] == true;
    return Scaffold(
      appBar: AppBar(title: const Text('Money Transfer')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null) ErrorBanner(_error!),
          TextField(
            controller: _mobile,
            enabled: _remitter == null,
            keyboardType: TextInputType.phone,
            maxLength: 10,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(labelText: "Sender's mobile number", counterText: ''),
            onChanged: (_) => setState(() => _notFound = false),
          ),
          const SizedBox(height: 12),
          if (_remitter == null && !_notFound)
            PrimaryButton(label: 'Continue', loading: _busy, onPressed: _mobile.text.length == 10 ? _search : null),
          if (_notFound) ...[
            const InfoBanner('New sender — register them to continue.'),
            TextField(
              controller: _name,
              decoration: const InputDecoration(labelText: "Sender's full name"),
            ),
            const SizedBox(height: 12),
            PrimaryButton(label: 'Register sender', loading: _busy, onPressed: _register),
          ],
          if (_remitter != null) ...[
            Card(
              child: ListTile(
                leading: const Icon(Icons.person),
                title: Text('${_remitter!['name']}'),
                subtitle: Text('${_remitter!['mobileNumber']} · limit ${verified ? '₹25,000' : '₹5,000 (KYC pending)'}'),
                trailing: verified
                    ? const Icon(Icons.verified, color: brand)
                    : TextButton(onPressed: _busy ? null : _verify, child: const Text('Verify KYC')),
              ),
            ),
            SectionTitle(
              'Beneficiary',
              trailing: TextButton.icon(onPressed: _busy ? null : _addBeneficiary, icon: const Icon(Icons.add), label: const Text('Add')),
            ),
            if (_beneficiaries.isEmpty)
              const Card(
                child: Padding(padding: EdgeInsets.all(16), child: Text('No beneficiaries yet — add one.')),
              )
            else
              Card(
                child: Column(
                  children: [
                    for (final b in _beneficiaries)
                      ListTile(
                        onTap: () => setState(() => _beneficiary = b),
                        leading: Icon(
                          _beneficiary?['id'] == b['id'] ? Icons.check_circle : Icons.circle_outlined,
                          color: _beneficiary?['id'] == b['id'] ? brand : Colors.grey,
                        ),
                        title: Text('${b['name']}'),
                        subtitle: Text('${b['bankName']} · ${b['accountNumber']} · ${b['ifsc']}'),
                      ),
                  ],
                ),
              ),
            if (_beneficiary != null) ...[
              const SizedBox(height: 16),
              TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(labelText: 'Amount', prefixText: '₹ '),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 12),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'IMPS', label: Text('IMPS (instant)')),
                  ButtonSegment(value: 'NEFT', label: Text('NEFT')),
                ],
                selected: {_mode},
                onSelectionChanged: (s) => setState(() => _mode = s.first),
              ),
              const SizedBox(height: 8),
              Text('Transfer charges, if any, are shown on the receipt.', style: TextStyle(color: Colors.grey.shade700, fontSize: 12)),
              const SizedBox(height: 16),
              PrimaryButton(
                label: 'Send ${toDouble(_amount.text) > 0 ? inr(_amount.text, decimals: false) : ''}',
                loading: _busy,
                onPressed: toDouble(_amount.text) > 0 ? _send : null,
              ),
            ],
          ],
        ],
      ),
    );
  }
}
