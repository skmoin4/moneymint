import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/session.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import 'bill_screen.dart';
import 'dmt_screen.dart';
import 'history_screen.dart';
import 'notifications_screen.dart';
import 'recharge_screen.dart';
import 'balance_request_screen.dart';

class _Service {
  const _Service(this.label, this.icon, this.open);
  final String label;
  final IconData icon;
  final Widget Function() open;
}

final _services = <_Service>[
  _Service('Mobile', Icons.smartphone, () => const RechargeScreen(type: 'PREPAID', title: 'Mobile Recharge')),
  _Service('DTH', Icons.satellite_alt, () => const RechargeScreen(type: 'DTH', title: 'DTH Recharge')),
  _Service('FASTag', Icons.directions_car, () => const RechargeScreen(type: 'FASTAG', title: 'FASTag Recharge')),
  _Service('OTT', Icons.live_tv, () => const RechargeScreen(type: 'OTT', title: 'OTT Subscription')),
  _Service('Electricity', Icons.bolt, () => const BillScreen(type: 'ELECTRICITY', title: 'Electricity Bill')),
  _Service('Gas', Icons.local_fire_department, () => const BillScreen(type: 'GAS', title: 'Gas Bill')),
  _Service('Money\nTransfer', Icons.send, () => const DmtScreen()),
  _Service('Request\nBalance', Icons.account_balance, () => const BalanceRequestScreen()),
];

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.onOpenTab});
  final void Function(int tab) onOpenTab;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String? _notice;
  List<Map<String, dynamic>> _recent = [];
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final session = context.read<Session>();
    final api = session.api;
    await session.refreshBalance();
    try {
      final results = await Future.wait([
        api.get('/notices/active'),
        api.get('/recharge/history', query: {'pageSize': 5}),
        api.get('/broadcast/my-notifications'),
      ]);
      if (!mounted) return;
      setState(() {
        _notice = (results[0]['notice'] as Map?)?['message'] as String?;
        _recent = (results[1]['transactions'] as List).cast<Map<String, dynamic>>();
        _unread = (results[2]['unreadCount'] as num?)?.toInt() ?? 0;
      });
    } catch (_) {}
  }

  void _open(Widget screen) async {
    await Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    return Scaffold(
      appBar: AppBar(
        title: Text('Hi, ${session.user?.name.split(' ').first ?? ''}'),
        actions: [
          IconButton(
            tooltip: 'Notifications',
            onPressed: () => _open(const NotificationsScreen()),
            icon: Badge(isLabelVisible: _unread > 0, label: Text('$_unread'), child: const Icon(Icons.notifications_outlined)),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _BalanceCard(balance: session.balance, onAddMoney: () => widget.onOpenTab(2)),
            if (_notice != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: const Color(0xFFD9232D), borderRadius: BorderRadius.circular(3)),
                      child: const Text(
                        'News',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 12),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        _notice!,
                        style: const TextStyle(color: Color(0xFF138A72), fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SectionTitle('Recharge & Pay'),
            Card(
              child: GridView.count(
                crossAxisCount: 4,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                padding: const EdgeInsets.symmetric(vertical: 8),
                children: [
                  for (final s in _services)
                    InkWell(
                      onTap: () => _open(s.open()),
                      borderRadius: BorderRadius.circular(8),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          CircleAvatar(
                            radius: 22,
                            backgroundColor: brand.withValues(alpha: 0.12),
                            child: Icon(s.icon, color: brandDark),
                          ),
                          const SizedBox(height: 6),
                          Text(s.label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 11.5, height: 1.15)),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            SectionTitle(
              'Recent transactions',
              trailing: TextButton(onPressed: () => widget.onOpenTab(1), child: const Text('See all')),
            ),
            Card(
              child: _recent.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.all(24),
                      child: Center(child: Text('No transactions yet')),
                    )
                  : Column(
                      children: [for (final t in _recent) TxnTile(txn: t, onChanged: _load)],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.balance, required this.onAddMoney});
  final double balance;
  final VoidCallback onAddMoney;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [sideDark, Color(0xFF23303C)]),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Wallet balance', style: TextStyle(color: Colors.white70)),
                const SizedBox(height: 4),
                Text(
                  inr(balance),
                  style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
          FilledButton.icon(onPressed: onAddMoney, icon: const Icon(Icons.add), label: const Text('Add Money')),
        ],
      ),
    );
  }
}
