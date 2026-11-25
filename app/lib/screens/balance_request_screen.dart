import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../state/session.dart';
import '../util/format.dart';
import '../widgets/common.dart';

/// Deposit into your distributor's (or the company's) bank account, then file the UTR
/// here for them to approve.
class BalanceRequestScreen extends StatefulWidget {
  const BalanceRequestScreen({super.key});

  @override
  State<BalanceRequestScreen> createState() => _BalanceRequestScreenState();
}

class _BalanceRequestScreenState extends State<BalanceRequestScreen> {
  final _amount = TextEditingController();
  final _utr = TextEditingController();
  List<Map<String, dynamic>> _accounts = [];
  List<String> _modes = [];
  List<Map<String, dynamic>> _requests = [];
  Map<String, dynamic>? _account;
  String? _mode;
  bool _busy = false;
  String? _error;
  String? _info;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final api = context.read<Session>().api;
    try {
      final r = await Future.wait([api.get('/bank-accounts'), api.get('/payment-modes'), api.get('/balance-requests')]);
      if (!mounted) return;
      setState(() {
        _accounts = (r[0]['accounts'] as List).cast<Map<String, dynamic>>();
        _modes = (r[1]['modes'] as List).where((m) => m['isActive'] == true).map((m) => '${m['name']}').toList();
        _requests = (r[2]['requests'] as List).cast<Map<String, dynamic>>();
        _account ??= _accounts.firstOrNull;
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorOf(e));
    }
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
      _info = null;
    });
    try {
      await context.read<Session>().api.post('/balance-requests', {
        'amount': toDouble(_amount.text),
        'utrNumber': _utr.text.trim(),
        if (_account != null) 'bankAccountId': _account!['id'],
        'paymentMode': ?_mode,
      });
      _amount.clear();
      _utr.clear();
      setState(() => _info = 'Request submitted. You will be notified when it is approved.');
      await _load();
    } catch (e) {
      setState(() => _error = errorOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Request balance')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null) ErrorBanner(_error!),
          if (_info != null) InfoBanner(_info!),
          const SectionTitle('1. Deposit into'),
          if (_accounts.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text('No bank account is listed yet. Ask your distributor for their bank details.'),
              ),
            )
          else
            Card(
              child: Column(
                children: [
                  for (final a in _accounts)
                    ListTile(
                      onTap: () => setState(() => _account = a),
                      leading: Icon(
                        _account?['id'] == a['id'] ? Icons.check_circle : Icons.circle_outlined,
                        color: _account?['id'] == a['id'] ? brand : Colors.grey,
                      ),
                      title: Text('${a['bankName']} · ${a['accountName']}'),
                      subtitle: SelectableText(
                        'A/c ${a['accountNumber']}  ·  IFSC ${a['ifsc']}${a['upiId'] != null ? '\nUPI ${a['upiId']}' : ''}',
                      ),
                    ),
                ],
              ),
            ),
          const SectionTitle('2. Tell us about the deposit'),
          TextField(
            controller: _amount,
            keyboardType: TextInputType.number,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: const InputDecoration(labelText: 'Amount deposited', prefixText: '₹ '),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _utr,
            decoration: const InputDecoration(labelText: 'UTR / reference number'),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            children: [
              for (final m in _modes) ChoiceChip(label: Text(m), selected: _mode == m, onSelected: (_) => setState(() => _mode = m)),
            ],
          ),
          const SizedBox(height: 16),
          PrimaryButton(
            label: 'Submit request',
            loading: _busy,
            onPressed: toDouble(_amount.text) > 0 && _utr.text.trim().length >= 4 ? _submit : null,
          ),
          const SectionTitle('My requests'),
          Card(
            child: _requests.isEmpty
                ? const Padding(
                    padding: EdgeInsets.all(20),
                    child: Center(child: Text('No requests yet')),
                  )
                : Column(
                    children: [
                      for (final r in _requests)
                        ListTile(
                          dense: true,
                          title: Text('${inr(r['amount'])} · UTR ${r['utrNumber']}'),
                          subtitle: Text([dateTime('${r['createdAt']}'), if (r['remarks'] != null) '${r['remarks']}'].join(' · ')),
                          trailing: StatusBadge('${r['status']}'),
                        ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}
