import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/session.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import 'txn_result_screen.dart';

IconData _iconFor(String type) => switch (type) {
  'BBPS' => Icons.receipt,
  'DMT' => Icons.send,
  'AEPS' => Icons.fingerprint,
  _ => Icons.smartphone,
};

/// One transaction row; tap opens details with status check and "Raise complaint".
class TxnTile extends StatelessWidget {
  const TxnTile({super.key, required this.txn, this.onChanged});
  final Map<String, dynamic> txn;
  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context) {
    final status = txn['status'] as String;
    final operator = (txn['operator'] as Map?)?['name'] ?? '';
    return ListTile(
      leading: CircleAvatar(
        backgroundColor: statusColor(status).withValues(alpha: 0.15),
        child: Icon(_iconFor('${txn['type']}'), color: statusColor(status)),
      ),
      title: Text('$operator · ${txn['identifier']}', maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Text(dateTime('${txn['createdAt']}')),
      trailing: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(inr(txn['amount']), style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 3),
          StatusBadge(status),
        ],
      ),
      onTap: () async {
        await showModalBottomSheet(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          builder: (_) => TxnDetailSheet(txn: txn),
        );
        onChanged?.call();
      },
    );
  }
}

class TxnDetailSheet extends StatelessWidget {
  const TxnDetailSheet({super.key, required this.txn});
  final Map<String, dynamic> txn;

  Future<void> _complain(BuildContext context) async {
    final subject = TextEditingController(text: 'Issue with ${txn['type']} ${txn['identifier']}');
    final desc = TextEditingController();
    final sent = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Raise complaint'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: subject,
              decoration: const InputDecoration(labelText: 'Subject'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: desc,
              maxLines: 3,
              decoration: const InputDecoration(labelText: 'What went wrong?'),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () async {
              try {
                await ctx.read<Session>().api.post('/complaints', {
                  'subject': subject.text.trim(),
                  'description': desc.text.trim(),
                  'transactionRef': txn['id'],
                });
                if (ctx.mounted) Navigator.pop(ctx, true);
              } catch (e) {
                if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text(errorOf(e))));
              }
            },
            child: const Text('Submit'),
          ),
        ],
      ),
    );
    if (sent == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Complaint submitted. We will update you.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = <(String, String)>[
      ('Status', '${txn['status']}'),
      ('Operator', '${(txn['operator'] as Map?)?['name'] ?? ''}'),
      ('Number', '${txn['identifier']}'),
      ('Amount', inr(txn['amount'])),
      if (toDouble(txn['surcharge']) > 0) ('Charges', inr(txn['surcharge'])),
      if (toDouble(txn['commission']) > 0) ('Commission', inr(txn['commission'])),
      if (txn['providerRefId'] != null) ('Operator ref', '${txn['providerRefId']}'),
      ('Transaction ID', '${txn['id']}'),
      ('Time', dateTime('${txn['createdAt']}')),
    ];
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final (k, v) in rows)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  children: [
                    SizedBox(
                      width: 120,
                      child: Text(k, style: TextStyle(color: Colors.grey.shade700)),
                    ),
                    Expanded(
                      child: SelectableText(
                        v,
                        textAlign: TextAlign.right,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            Row(
              children: [
                if (txn['status'] == 'PENDING')
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () {
                        Navigator.pop(context);
                        Navigator.push(context, MaterialPageRoute(builder: (_) => TxnResultScreen(txn: txn)));
                      },
                      child: const Text('Track status'),
                    ),
                  ),
                if (txn['status'] == 'PENDING') const SizedBox(width: 10),
                Expanded(
                  child: FilledButton(onPressed: () => _complain(context), child: const Text('Raise complaint')),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  static const _filters = {'': 'All', 'SUCCESS': 'Success', 'PENDING': 'Pending', 'FAILED': 'Failed', 'REFUNDED': 'Refunded'};
  String _status = '';
  final List<Map<String, dynamic>> _items = [];
  int _page = 1;
  int _total = 0;
  bool _loading = false;
  String? _error;
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _reload();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 300) _loadMore();
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    _items.clear();
    _page = 1;
    _total = 0;
    await _fetch();
  }

  Future<void> _loadMore() async {
    if (_loading || _items.length >= _total) return;
    _page++;
    await _fetch();
  }

  Future<void> _fetch() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final res = await context.read<Session>().api.get('/recharge/history', query: {'page': _page, 'pageSize': 20, 'status': _status});
      _items.addAll((res['transactions'] as List).cast<Map<String, dynamic>>());
      _total = (res['total'] as num).toInt();
    } catch (e) {
      _error = errorOf(e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('History')),
      body: Column(
        children: [
          SizedBox(
            height: 52,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              children: [
                for (final e in _filters.entries)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text(e.value),
                      selected: _status == e.key,
                      onSelected: (_) {
                        setState(() => _status = e.key);
                        _reload();
                      },
                    ),
                  ),
              ],
            ),
          ),
          if (_error != null) Padding(padding: const EdgeInsets.all(12), child: ErrorBanner(_error!)),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _reload,
              child: _items.isEmpty && !_loading
                  ? ListView(
                      children: const [
                        SizedBox(height: 120),
                        Center(child: Text('No transactions')),
                      ],
                    )
                  : ListView.separated(
                      controller: _scroll,
                      itemCount: _items.length + (_loading ? 1 : 0),
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (_, i) => i >= _items.length
                          ? const Padding(
                              padding: EdgeInsets.all(16),
                              child: Center(child: CircularProgressIndicator()),
                            )
                          : Container(
                              color: Colors.white,
                              child: TxnTile(txn: _items[i], onChanged: _reload),
                            ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}
