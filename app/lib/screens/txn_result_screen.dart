import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/session.dart';
import '../util/format.dart';
import '../widgets/common.dart';

/// Outcome of a recharge / bill / transfer. While PENDING, polls the status endpoint
/// (which also asks the operator) every 5 seconds for up to 3 minutes.
class TxnResultScreen extends StatefulWidget {
  const TxnResultScreen({super.key, required this.txn, this.operatorName});
  final Map<String, dynamic> txn;
  final String? operatorName;

  @override
  State<TxnResultScreen> createState() => _TxnResultScreenState();
}

class _TxnResultScreenState extends State<TxnResultScreen> {
  late Map<String, dynamic> _txn = widget.txn;
  Timer? _poll;
  int _polls = 0;

  String get _status => _txn['status'] as String;

  @override
  void initState() {
    super.initState();
    context.read<Session>().refreshBalance();
    if (_status == 'PENDING') {
      _poll = Timer.periodic(const Duration(seconds: 5), (_) => _check());
    }
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _check() async {
    if (++_polls > 36) return _poll?.cancel();
    try {
      final res = await context.read<Session>().api.get('/recharge/status/${_txn['id']}');
      final fresh = res['transaction'] as Map<String, dynamic>;
      if (!mounted) return;
      setState(() => _txn = {..._txn, ...fresh});
      if (_status != 'PENDING') {
        _poll?.cancel();
        if (mounted) context.read<Session>().refreshBalance();
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final (icon, title, subtitle) = switch (_status) {
      'SUCCESS' => (Icons.check_circle, 'Successful', null),
      'FAILED' => (Icons.cancel, 'Failed', 'The amount has been refunded to your wallet.'),
      'REFUNDED' => (Icons.replay_circle_filled, 'Refunded', 'The amount has been refunded to your wallet.'),
      _ => (
        Icons.hourglass_top,
        'Processing',
        'The operator is confirming this. You can leave this screen — the status updates in History.',
      ),
    };
    final operatorName = widget.operatorName ?? (_txn['operator'] as Map?)?['name'] as String?;
    final rows = <(String, String)>[
      if (operatorName != null) ('Operator', operatorName),
      ('Number', '${_txn['identifier']}'),
      ('Amount', inr(_txn['amount'])),
      if (toDouble(_txn['surcharge']) > 0) ('Charges', inr(_txn['surcharge'])),
      if (toDouble(_txn['commission']) > 0) ('Commission earned', inr(_txn['commission'])),
      if (_txn['providerRefId'] != null) ('Operator ref', '${_txn['providerRefId']}'),
      if (_txn['statusMessage'] != null) ('Message', '${_txn['statusMessage']}'),
      ('Transaction ID', '${_txn['id']}'),
      ('Time', dateTime('${_txn['createdAt']}')),
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Transaction')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const SizedBox(height: 12),
          Icon(icon, size: 84, color: statusColor(_status)),
          const SizedBox(height: 8),
          Text(
            title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(color: statusColor(_status), fontWeight: FontWeight.bold),
          ),
          if (subtitle != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(subtitle, textAlign: TextAlign.center),
            ),
          if (_status == 'PENDING') const Padding(padding: EdgeInsets.only(top: 12), child: LinearProgressIndicator()),
          const SizedBox(height: 20),
          Card(
            child: Column(
              children: [
                for (final (k, v) in rows)
                  ListTile(
                    dense: true,
                    title: Text(k, style: TextStyle(color: Colors.grey.shade700)),
                    trailing: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 220),
                      child: Text(
                        v,
                        textAlign: TextAlign.right,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          PrimaryButton(label: 'Done', onPressed: () => Navigator.pop(context)),
        ],
      ),
    );
  }
}
