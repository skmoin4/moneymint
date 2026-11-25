import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../config.dart';
import '../state/session.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import 'balance_request_screen.dart';
import 'notifications_screen.dart';

const _roleLabel = {'MASTER_DISTRIBUTOR': 'Master Distributor', 'DISTRIBUTOR': 'Distributor', 'RETAILER': 'Retailer', 'ADMIN': 'Admin'};

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  void _push(BuildContext context, Widget w) => Navigator.push(context, MaterialPageRoute(builder: (_) => w));

  @override
  Widget build(BuildContext context) {
    final session = context.watch<Session>();
    final user = session.user!;
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: CircleAvatar(
                backgroundColor: brand,
                child: Text(user.name.characters.first.toUpperCase(), style: const TextStyle(color: Colors.white)),
              ),
              title: Text(user.name, style: const TextStyle(fontWeight: FontWeight.w600)),
              subtitle: Text('${user.phone} · ${_roleLabel[user.role] ?? user.role}'),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.percent),
                  title: const Text('My commission'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _push(context, const MyCommissionScreen()),
                ),
                ListTile(
                  leading: const Icon(Icons.account_balance),
                  title: const Text('Request balance (bank deposit)'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _push(context, const BalanceRequestScreen()),
                ),
                ListTile(
                  leading: const Icon(Icons.support_agent),
                  title: const Text('My complaints'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _push(context, const ComplaintsScreen()),
                ),
                ListTile(
                  leading: const Icon(Icons.notifications_outlined),
                  title: const Text('Notifications'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _push(context, const NotificationsScreen()),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.pin_outlined),
                  title: const Text('Transaction PIN'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => _push(context, const PinScreen()),
                ),
                ListTile(
                  leading: const Icon(Icons.devices),
                  title: const Text('Log out of all devices'),
                  onTap: () async {
                    final ok = await showDialog<bool>(
                      context: context,
                      builder: (ctx) => AlertDialog(
                        title: const Text('Log out everywhere?'),
                        content: const Text('Every device signed in to your account, including this one, will be logged out.'),
                        actions: [
                          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
                          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Log out all')),
                        ],
                      ),
                    );
                    if (ok == true) await session.logout(allDevices: true);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.logout, color: Color(0xFFED5565)),
                  title: const Text('Log out', style: TextStyle(color: Color(0xFFED5565))),
                  onTap: () => session.logout(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Center(
            child: Text('$appName · v1.0.0', style: TextStyle(color: Colors.grey.shade600)),
          ),
        ],
      ),
    );
  }
}

class MyCommissionScreen extends StatefulWidget {
  const MyCommissionScreen({super.key});

  @override
  State<MyCommissionScreen> createState() => _MyCommissionScreenState();
}

class _MyCommissionScreenState extends State<MyCommissionScreen> {
  Map<String, dynamic>? _pack;
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    context.read<Session>().api.get('/users/my-commission').then((res) {
      if (mounted) {
        setState(() {
          _pack = res['pack'] as Map<String, dynamic>?;
          _loaded = true;
        });
      }
    });
  }

  String _rate(Map s) {
    final v = toDouble(s['value']);
    final text = s['commissionType'] == 'PERCENT' ? '${v.toStringAsFixed(v.truncateToDouble() == v ? 0 : 2)}%' : inr(v);
    return s['chargeType'] == 'SURCHARGE' ? 'Charge $text' : text;
  }

  String _range(Map s) {
    final lo = s['minAmount'], hi = s['maxAmount'];
    if (lo == null && hi == null) return 'Any amount';
    if (hi == null) return '${inr(lo, decimals: false)}+';
    return '${inr(lo ?? 0, decimals: false)} – ${inr(hi, decimals: false)}';
  }

  @override
  Widget build(BuildContext context) {
    final slabs = ((_pack?['slabs'] as List?) ?? []).cast<Map<String, dynamic>>();
    return Scaffold(
      appBar: AppBar(title: const Text('My commission')),
      body: !_loaded
          ? const Center(child: CircularProgressIndicator())
          : _pack == null
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Text('No commission pack assigned yet. Ask your distributor.', textAlign: TextAlign.center),
              ),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Pack: ${_pack!['name']}', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 10),
                Card(
                  child: Column(
                    children: [
                      for (final s in slabs)
                        ListTile(
                          dense: true,
                          title: Text('${(s['operator'] as Map)['name']}'),
                          subtitle: Text(_range(s)),
                          trailing: Text(
                            _rate(s),
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              color: s['chargeType'] == 'SURCHARGE' ? const Color(0xFFED5565) : brandDark,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}

class ComplaintsScreen extends StatefulWidget {
  const ComplaintsScreen({super.key});

  @override
  State<ComplaintsScreen> createState() => _ComplaintsScreenState();
}

class _ComplaintsScreenState extends State<ComplaintsScreen> {
  List<Map<String, dynamic>>? _items;

  @override
  void initState() {
    super.initState();
    context.read<Session>().api.get('/complaints').then((res) {
      if (mounted) setState(() => _items = (res['complaints'] as List).cast<Map<String, dynamic>>());
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My complaints')),
      body: _items == null
          ? const Center(child: CircularProgressIndicator())
          : _items!.isEmpty
          ? const Center(child: Text('No complaints. Raise one from a transaction in History.'))
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: _items!.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                final c = _items![i];
                return Card(
                  child: ListTile(
                    title: Text('${c['subject']}'),
                    subtitle: Text(
                      [
                        c['description'],
                        if (c['adminRemarks'] != null) 'Reply: ${c['adminRemarks']}',
                        dateTime('${c['createdAt']}'),
                      ].join('\n'),
                    ),
                    isThreeLine: true,
                    trailing: StatusBadge('${c['status']}'),
                  ),
                );
              },
            ),
    );
  }
}

class PinScreen extends StatefulWidget {
  const PinScreen({super.key});

  @override
  State<PinScreen> createState() => _PinScreenState();
}

class _PinScreenState extends State<PinScreen> {
  bool? _hasPin;
  bool _enabled = false;
  final _pin = TextEditingController();
  String? _message;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final res = await context.read<Session>().api.get('/auth/pin/status');
    if (mounted) {
      setState(() {
        _hasPin = res['hasPin'] == true;
        _enabled = res['pinEnabled'] == true;
      });
    }
  }

  Future<void> _setPin() async {
    setState(() {
      _error = null;
      _message = null;
    });
    try {
      await context.read<Session>().api.post('/auth/pin/set', {'pin': _pin.text});
      _pin.clear();
      setState(() => _message = 'PIN saved.');
      await _load();
    } catch (e) {
      setState(() => _error = errorOf(e));
    }
  }

  Future<void> _toggle(bool v) async {
    try {
      await context.read<Session>().api.post('/auth/pin/toggle', {'enabled': v});
      setState(() => _enabled = v);
    } catch (e) {
      setState(() => _error = errorOf(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Transaction PIN')),
      body: _hasPin == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_error != null) ErrorBanner(_error!),
                if (_message != null) InfoBanner(_message!),
                const Text('When enabled, every recharge, bill payment and money transfer asks for this PIN.'),
                const SizedBox(height: 16),
                Card(
                  child: SwitchListTile(
                    title: const Text('Ask for PIN on payments'),
                    value: _enabled,
                    onChanged: _hasPin! ? _toggle : null,
                    subtitle: _hasPin! ? null : const Text('Set a PIN first'),
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _pin,
                  obscureText: true,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  decoration: InputDecoration(labelText: _hasPin! ? 'New PIN (4–6 digits)' : 'Choose a PIN (4–6 digits)'),
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 8),
                PrimaryButton(label: _hasPin! ? 'Change PIN' : 'Set PIN', onPressed: _pin.text.length >= 4 ? _setPin : null),
              ],
            ),
    );
  }
}
