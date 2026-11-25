import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../state/session.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import 'recharge_screen.dart';
import 'txn_result_screen.dart';

/// BBPS bill payment: biller → consumer number → fetch bill → pay.
class BillScreen extends StatefulWidget {
  const BillScreen({super.key, required this.type, required this.title});
  final String type;
  final String title;

  @override
  State<BillScreen> createState() => _BillScreenState();
}

class _BillScreenState extends State<BillScreen> {
  final _consumer = TextEditingController();
  final _amount = TextEditingController();
  List<Operator> _billers = [];
  Operator? _biller;
  Map<String, dynamic>? _bill;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    context.read<Session>().api.get('/operators', query: {'activeOnly': 1}).then((res) {
      if (!mounted) return;
      setState(
        () => _billers = (res['operators'] as List)
            .map((o) => Operator.fromJson(o as Map<String, dynamic>))
            .where((o) => o.type == widget.type)
            .toList(),
      );
    });
  }

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

  Future<void> _fetch() => _run(() async {
    final res = await context.read<Session>().api.post('/bbps/fetch-bill', {
      'operatorCode': _biller!.code,
      'consumerNumber': _consumer.text.trim(),
    });
    final bill = res['bill'] as Map<String, dynamic>;
    setState(() {
      _bill = bill;
      _amount.text = toDouble(bill['dueAmount']).toStringAsFixed(2);
    });
  });

  Future<void> _pay() => _run(() async {
    final pin = await askPinIfEnabled(context);
    if (!mounted) return;
    final res = await context.read<Session>().api.post('/bbps/pay', {
      'operatorCode': _biller!.code,
      'consumerNumber': _consumer.text.trim(),
      'amount': toDouble(_amount.text),
      'pin': ?pin,
    });
    if (!mounted) return;
    await Navigator.pushReplacement(
      context,
      MaterialPageRoute(
        builder: (_) => TxnResultScreen(txn: res['transaction'] as Map<String, dynamic>, operatorName: _biller!.name),
      ),
    );
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null) ErrorBanner(_error!),
          InkWell(
            onTap: () async {
              final b = await pickFromList<Operator>(context, title: 'Select biller', items: _billers, label: (o) => o.name);
              if (b != null) {
                setState(() {
                  _biller = b;
                  _bill = null;
                });
              }
            },
            child: InputDecorator(
              decoration: const InputDecoration(labelText: 'Biller', suffixIcon: Icon(Icons.arrow_drop_down)),
              child: Text(_biller?.name ?? 'Select biller', style: TextStyle(color: _biller == null ? Colors.grey : null)),
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _consumer,
            decoration: const InputDecoration(labelText: 'Consumer / account number'),
            onChanged: (_) => setState(() => _bill = null),
          ),
          const SizedBox(height: 16),
          if (_bill == null)
            PrimaryButton(
              label: 'Fetch bill',
              loading: _busy,
              onPressed: _biller != null && _consumer.text.trim().length >= 3 ? _fetch : null,
            )
          else ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${_bill!['consumerName']}', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    Text('Due: ${inr(_bill!['dueAmount'])}${_bill!['dueDate'] != null ? '  ·  by ${_bill!['dueDate']}' : ''}'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _amount,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
              decoration: const InputDecoration(labelText: 'Amount to pay', prefixText: '₹ '),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 16),
            PrimaryButton(label: 'Pay ${inr(_amount.text)}', loading: _busy, onPressed: toDouble(_amount.text) > 0 ? _pay : null),
          ],
        ],
      ),
    );
  }
}
