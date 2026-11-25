import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../state/session.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import 'txn_result_screen.dart';

class Operator {
  Operator(this.id, this.name, this.code, this.type);
  final String id;
  final String name;
  final String code;
  final String type;
  factory Operator.fromJson(Map<String, dynamic> j) =>
      Operator(j['id'] as String, j['name'] as String, j['code'] as String, j['type'] as String);
}

/// Prepaid / DTH / FASTag / OTT recharge: number → operator (auto-detected for mobile)
/// → amount (or pick a plan) → PIN if enabled → result.
class RechargeScreen extends StatefulWidget {
  const RechargeScreen({super.key, required this.type, required this.title});
  final String type;
  final String title;

  @override
  State<RechargeScreen> createState() => _RechargeScreenState();
}

class _RechargeScreenState extends State<RechargeScreen> {
  final _number = TextEditingController();
  final _amount = TextEditingController();
  List<Operator> _operators = [];
  Operator? _operator;
  bool _autoDetected = false;
  // One idempotency key per payment attempt on this screen: a retry after a network
  // error reuses it, so the server never charges twice.
  final String _clientRef = newClientRef();
  bool _busy = false;
  String? _error;
  Timer? _detectDebounce;

  bool get _isMobile => widget.type == 'PREPAID';
  String get _numberLabel => switch (widget.type) {
    'PREPAID' => 'Mobile number',
    'DTH' => 'Subscriber / Customer ID',
    'FASTAG' => 'Vehicle / FASTag number',
    _ => 'Registered mobile number',
  };

  @override
  void initState() {
    super.initState();
    context
        .read<Session>()
        .api
        .get('/operators', query: {'activeOnly': 1})
        .then((res) {
          if (!mounted) return;
          setState(
            () => _operators = (res['operators'] as List)
                .map((o) => Operator.fromJson(o as Map<String, dynamic>))
                .where((o) => o.type == widget.type)
                .toList(),
          );
        })
        .catchError((Object e) {
          if (mounted) setState(() => _error = errorOf(e));
        });
  }

  @override
  void dispose() {
    _detectDebounce?.cancel();
    _number.dispose();
    _amount.dispose();
    super.dispose();
  }

  void _onNumberChanged(String v) {
    setState(() {});
    if (!_isMobile || v.length < 4 || (_operator != null && !_autoDetected)) return;
    _detectDebounce?.cancel();
    _detectDebounce = Timer(const Duration(milliseconds: 300), () async {
      try {
        final res = await context.read<Session>().api.get('/operators/detect', query: {'mobileNumber': v});
        final op = res['operator'] as Map<String, dynamic>?;
        if (op == null || !mounted) return;
        final match = _operators.where((o) => o.id == op['id']).firstOrNull;
        if (match != null) {
          setState(() {
            _operator = match;
            _autoDetected = true;
          });
        }
      } catch (_) {}
    });
  }

  Future<void> _chooseOperator() async {
    final picked = await pickFromList<Operator>(context, title: 'Select operator', items: _operators, label: (o) => o.name);
    if (picked != null) {
      setState(() {
        _operator = picked;
        _autoDetected = false;
      });
    }
  }

  Future<void> _browsePlans() async {
    if (_operator == null) return;
    final plan = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => PlansSheet(operator: _operator!),
    );
    if (plan != null) setState(() => _amount.text = toDouble(plan['amount']).toStringAsFixed(0));
  }

  bool get _valid => _number.text.trim().length >= 10 && _operator != null && toDouble(_amount.text) > 0;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final pin = await askPinIfEnabled(context);
      if (!mounted) return;
      final res = await context.read<Session>().api.post('/recharge', {
        'operatorCode': _operator!.code,
        'mobileNumber': _number.text.trim(),
        'amount': toDouble(_amount.text),
        'pin': ?pin,
        'clientRef': _clientRef,
      });
      if (!mounted) return;
      await Navigator.pushReplacement(
        context,
        MaterialPageRoute(
          builder: (_) => TxnResultScreen(txn: res['transaction'] as Map<String, dynamic>, operatorName: _operator!.name),
        ),
      );
    } on PinCancelled {
      // user backed out
    } catch (e) {
      if (mounted) setState(() => _error = errorOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final balance = context.watch<Session>().balance;
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null) ErrorBanner(_error!),
          TextField(
            controller: _number,
            keyboardType: _isMobile ? TextInputType.phone : TextInputType.text,
            maxLength: 15,
            inputFormatters: _isMobile ? [FilteringTextInputFormatter.digitsOnly] : null,
            decoration: InputDecoration(labelText: _numberLabel, counterText: ''),
            onChanged: _onNumberChanged,
          ),
          const SizedBox(height: 14),
          InkWell(
            onTap: _operators.isEmpty ? null : _chooseOperator,
            child: InputDecorator(
              decoration: InputDecoration(
                labelText: 'Operator',
                suffixIcon: const Icon(Icons.arrow_drop_down),
                helperText: _autoDetected ? 'Detected from number — tap to change' : null,
              ),
              child: Text(
                _operator?.name ?? (_operators.isEmpty ? 'Loading…' : 'Select operator'),
                style: TextStyle(color: _operator == null ? Colors.grey : null),
              ),
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _amount,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
            decoration: InputDecoration(
              labelText: 'Amount',
              prefixText: '₹ ',
              suffixIcon: (widget.type == 'PREPAID' || widget.type == 'DTH')
                  ? TextButton(onPressed: _operator == null ? null : _browsePlans, child: const Text('Browse plans'))
                  : null,
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 8),
          Text('Wallet balance: ${inr(balance)}', style: TextStyle(color: Colors.grey.shade700)),
          const SizedBox(height: 20),
          PrimaryButton(
            label: 'Recharge ${toDouble(_amount.text) > 0 ? inr(_amount.text, decimals: false) : ''}',
            loading: _busy,
            onPressed: _valid ? _submit : null,
          ),
        ],
      ),
    );
  }
}

/// The operator's plans, grouped by category tabs.
class PlansSheet extends StatefulWidget {
  const PlansSheet({super.key, required this.operator});
  final Operator operator;

  @override
  State<PlansSheet> createState() => _PlansSheetState();
}

class _PlansSheetState extends State<PlansSheet> {
  List<Map<String, dynamic>>? _plans;
  String? _error;

  @override
  void initState() {
    super.initState();
    context
        .read<Session>()
        .api
        .get('/plans', query: {'operatorCode': widget.operator.code})
        .then((res) {
          if (mounted) setState(() => _plans = (res['plans'] as List).cast<Map<String, dynamic>>());
        })
        .catchError((Object e) {
          if (mounted) setState(() => _error = errorOf(e));
        });
  }

  @override
  Widget build(BuildContext context) {
    final height = MediaQuery.of(context).size.height * 0.75;
    if (_error != null) return SizedBox(height: 200, child: Center(child: Text(_error!)));
    if (_plans == null) return const SizedBox(height: 200, child: Center(child: CircularProgressIndicator()));
    if (_plans!.isEmpty) {
      return const SizedBox(height: 200, child: Center(child: Text('No plans listed for this operator — enter the amount.')));
    }
    final categories = _plans!.map((p) => p['category'] as String).toSet().toList();
    return SizedBox(
      height: height,
      child: DefaultTabController(
        length: categories.length,
        child: Column(
          children: [
            Text('${widget.operator.name} plans', style: Theme.of(context).textTheme.titleMedium),
            TabBar(
              isScrollable: true,
              tabAlignment: TabAlignment.start,
              tabs: [for (final c in categories) Tab(text: c)],
            ),
            Expanded(
              child: TabBarView(
                children: [
                  for (final c in categories)
                    ListView(
                      children: [
                        for (final p in _plans!.where((p) => p['category'] == c))
                          ListTile(
                            onTap: () => Navigator.pop(context, p),
                            leading: Text(
                              inr(p['amount'], decimals: false),
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                            ),
                            title: Text([p['validity'], p['data']].whereType<String>().join(' · ')),
                            subtitle: Text(
                              [p['talktime'], p['sms'], p['description']].whereType<String>().where((s) => s.isNotEmpty).join(' · '),
                            ),
                            trailing: const Icon(Icons.chevron_right),
                          ),
                      ],
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
