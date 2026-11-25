import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../state/session.dart';
import '../util/format.dart';
import '../widgets/common.dart';

/// Wallet: balance, Add Money (Razorpay checkout / own UPI QR) and the account statement.
class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final balance = context.watch<Session>().balance;
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Wallet'),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(96),
            child: Column(
              children: [
                Text(
                  inr(balance),
                  style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.bold),
                ),
                const TabBar(
                  labelColor: Colors.white,
                  unselectedLabelColor: Colors.white70,
                  indicatorColor: brand,
                  tabs: [
                    Tab(text: 'Add Money'),
                    Tab(text: 'Statement'),
                  ],
                ),
              ],
            ),
          ),
        ),
        body: const TabBarView(children: [AddMoneyTab(), StatementTab()]),
      ),
    );
  }
}

class AddMoneyTab extends StatefulWidget {
  const AddMoneyTab({super.key});

  @override
  State<AddMoneyTab> createState() => _AddMoneyTabState();
}

class _AddMoneyTabState extends State<AddMoneyTab> with AutomaticKeepAliveClientMixin {
  final _amount = TextEditingController();
  Map<String, dynamic>? _config;
  Map<String, dynamic>? _qr;
  List<Map<String, dynamic>> _history = [];
  bool _busy = false;
  String? _error;
  String? _info;
  Razorpay? _razorpay;
  String _testMethod = 'upi';

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    if (!kIsWeb) {
      _razorpay = Razorpay()
        ..on(Razorpay.EVENT_PAYMENT_SUCCESS, _onRazorpaySuccess)
        ..on(Razorpay.EVENT_PAYMENT_ERROR, _onRazorpayError);
    }
    _load();
  }

  @override
  void dispose() {
    _razorpay?.clear();
    _amount.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final api = context.read<Session>().api;
    try {
      final config = await api.get('/wallet/add-money/config');
      final history = await api.get('/wallet/add-money/history');
      Map<String, dynamic>? qr;
      if (config['enabled'] == true) {
        try {
          qr = (await api.get('/wallet/add-money/qr'))['qr'] as Map<String, dynamic>;
        } catch (_) {}
      }
      if (!mounted) return;
      setState(() {
        _config = config;
        _qr = qr;
        _history = (history['orders'] as List).cast<Map<String, dynamic>>();
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorOf(e));
    }
  }

  bool get _isMock => _config?['gateway'] == 'MOCK';

  Future<void> _pay() async {
    setState(() {
      _busy = true;
      _error = null;
      _info = null;
    });
    final session = context.read<Session>();
    try {
      final res = await session.api.post('/wallet/add-money/order', {'amount': toDouble(_amount.text)});
      final checkout = res['checkout'] as Map<String, dynamic>;
      if (_isMock) {
        final paid = await session.api.post('/wallet/add-money/mock-pay', {'gatewayOrderId': checkout['orderId'], 'method': _testMethod});
        final order = paid['order'] as Map<String, dynamic>;
        _done('${inr(order['netAmount'] ?? order['amount'])} added (test payment).');
        return;
      }
      if (_razorpay == null) {
        throw Exception('Online payment opens in the Android / iOS app.');
      }
      _razorpay!.open({
        'key': checkout['keyId'],
        'order_id': checkout['orderId'],
        'amount': checkout['amount'],
        'currency': checkout['currency'],
        'name': checkout['name'],
        'description': checkout['description'],
        'prefill': checkout['prefill'],
        'theme': {'color': '#1AB394'},
      });
      // Result arrives in _onRazorpaySuccess / _onRazorpayError.
    } catch (e) {
      if (mounted) {
        setState(() => _error = e is Exception && e.toString().startsWith('Exception: ') ? e.toString().substring(11) : errorOf(e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _onRazorpaySuccess(PaymentSuccessResponse r) async {
    try {
      final v = await context.read<Session>().api.post('/wallet/add-money/verify', {
        'orderId': r.orderId,
        'paymentId': r.paymentId,
        'signature': r.signature,
      });
      final order = v['order'] as Map<String, dynamic>;
      _done(
        v['pending'] == true
            ? 'Payment received — your wallet will be credited in a moment.'
            : '${inr(order['netAmount'] ?? order['amount'])} added to your wallet.',
      );
    } catch (e) {
      if (mounted) {
        setState(() => _error = '${errorOf(e)}. If money was debited, it will be credited automatically once the bank confirms.');
      }
      _load();
    }
  }

  void _onRazorpayError(PaymentFailureResponse r) {
    if (mounted) setState(() => _error = r.message ?? 'Payment cancelled');
    _load();
  }

  void _done(String message) {
    if (!mounted) return;
    setState(() {
      _info = message;
      _amount.clear();
    });
    context.read<Session>().refreshBalance();
    _load();
  }

  Future<void> _simulateQr() async {
    final controller = TextEditingController(text: '100');
    final amount = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Simulate UPI payment (test)'),
        content: TextField(
          controller: controller,
          keyboardType: TextInputType.number,
          decoration: const InputDecoration(prefixText: '₹ '),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, controller.text), child: const Text('Pay')),
        ],
      ),
    );
    if (amount == null || toDouble(amount) <= 0 || !mounted) return;
    try {
      await context.read<Session>().api.post('/wallet/add-money/mock-qr-pay', {'amount': toDouble(amount)});
      _done('Test UPI payment of ${inr(amount)} received on your QR.');
    } catch (e) {
      if (mounted) setState(() => _error = errorOf(e));
    }
  }

  Widget _qrImage() {
    final dataUrl = _qr?['qrDataUrl'] as String?;
    final url = _qr?['imageUrl'] as String?;
    if (url != null) return Image.network(url, width: 200, height: 200);
    if (dataUrl != null) return Image.memory(base64Decode(dataUrl.split(',').last), width: 200, height: 200, gaplessPlayback: true);
    return const SizedBox.shrink();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final config = _config;
    if (config == null && _error == null) return const Center(child: CircularProgressIndicator());
    final limits = (config?['limits'] as Map?) ?? {};
    final charges = ((config?['chargePercents'] as Map?) ?? {}).entries.where((e) => toDouble(e.value) > 0).toList();

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_error != null) ErrorBanner(_error!),
          if (_info != null) InfoBanner(_info!),
          if (config?['enabled'] != true)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: Text('Online top-up is not available yet. Use Profile → Request Balance to deposit by bank transfer.'),
              ),
            )
          else ...[
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Pay online', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _amount,
                      keyboardType: TextInputType.number,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: InputDecoration(
                        labelText: 'Amount',
                        prefixText: '₹ ',
                        helperText:
                            'Min ${inr(limits['min'] ?? 10, decimals: false)} · Max ${inr(limits['max'] ?? 100000, decimals: false)}',
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final v in [500, 1000, 2000, 5000])
                          ActionChip(label: Text('₹$v'), onPressed: () => setState(() => _amount.text = '$v')),
                      ],
                    ),
                    if (_isMock) ...[
                      const SizedBox(height: 10),
                      SegmentedButton<String>(
                        segments: const [
                          ButtonSegment(value: 'upi', label: Text('UPI')),
                          ButtonSegment(value: 'card', label: Text('Card')),
                          ButtonSegment(value: 'netbanking', label: Text('Netbanking')),
                        ],
                        selected: {_testMethod},
                        onSelectionChanged: (s) => setState(() => _testMethod = s.first),
                      ),
                    ],
                    const SizedBox(height: 8),
                    Text(
                      charges.isEmpty
                          ? 'No charges'
                          : 'Charges: ${charges.map((e) => '${e.key == 'default' ? 'others' : e.key} ${e.value}%').join(', ')}',
                      style: TextStyle(color: Colors.grey.shade700, fontSize: 12),
                    ),
                    const SizedBox(height: 14),
                    PrimaryButton(
                      label: _isMock ? 'Pay (test mode)' : 'Proceed to pay',
                      loading: _busy,
                      onPressed: toDouble(_amount.text) > 0 ? _pay : null,
                    ),
                  ],
                ),
              ),
            ),
            if (_qr != null) ...[
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Text('Your UPI QR — auto credit', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 10),
                      _qrImage(),
                      if (_qr!['upiId'] != null) SelectableText('${_qr!['upiId']}', style: const TextStyle(fontFamily: 'monospace')),
                      const SizedBox(height: 6),
                      const Text(
                        'Pay any amount from any UPI app — it is added to your wallet automatically.',
                        textAlign: TextAlign.center,
                      ),
                      if (_isMock) TextButton(onPressed: _simulateQr, child: const Text('Simulate a UPI payment (test)')),
                    ],
                  ),
                ),
              ),
            ],
          ],
          const SectionTitle('Top-up history'),
          Card(
            child: _history.isEmpty
                ? const Padding(
                    padding: EdgeInsets.all(20),
                    child: Center(child: Text('No top-ups yet')),
                  )
                : Column(
                    children: [
                      for (final o in _history.take(20))
                        ListTile(
                          dense: true,
                          title: Text('${o['channel'] == 'QR' ? 'UPI QR' : 'Online'} · ${(o['method'] ?? '').toString().toUpperCase()}'),
                          subtitle: Text(dateTime('${o['createdAt']}')),
                          trailing: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(inr(o['netAmount'] ?? o['amount']), style: const TextStyle(fontWeight: FontWeight.w700)),
                              StatusBadge('${o['status']}'),
                            ],
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

class StatementTab extends StatefulWidget {
  const StatementTab({super.key});

  @override
  State<StatementTab> createState() => _StatementTabState();
}

class _StatementTabState extends State<StatementTab> with AutomaticKeepAliveClientMixin {
  final List<Map<String, dynamic>> _entries = [];
  int _page = 1;
  int _total = 0;
  bool _loading = false;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  Future<void> _reload() async {
    _entries.clear();
    _page = 1;
    await _fetch();
  }

  Future<void> _fetch() async {
    setState(() => _loading = true);
    try {
      final res = await context.read<Session>().api.get('/wallet/ledger', query: {'page': _page, 'pageSize': 30});
      _entries.addAll((res['entries'] as List).cast<Map<String, dynamic>>());
      _total = (res['total'] as num).toInt();
    } catch (_) {
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView.separated(
        itemCount: _entries.length + 1,
        separatorBuilder: (_, _) => const Divider(height: 1),
        itemBuilder: (_, i) {
          if (i == _entries.length) {
            if (_loading) {
              return const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            if (_entries.length < _total) {
              return TextButton(
                onPressed: () {
                  _page++;
                  _fetch();
                },
                child: const Text('Load more'),
              );
            }
            return _entries.isEmpty
                ? const Padding(
                    padding: EdgeInsets.all(32),
                    child: Center(child: Text('No entries yet')),
                  )
                : const SizedBox(height: 24);
          }
          final e = _entries[i];
          final credit = e['type'] == 'CREDIT';
          return Container(
            color: Colors.white,
            child: ListTile(
              title: Text(
                '${e['description'] ?? e['referenceType']}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13.5),
              ),
              subtitle: Text('${dateTime('${e['createdAt']}')} · Bal ${inr(e['balanceAfter'])}', style: const TextStyle(fontSize: 12)),
              trailing: Text(
                '${credit ? '+' : '−'}${inr(e['amount'])}',
                style: TextStyle(fontWeight: FontWeight.w700, color: credit ? brandDark : const Color(0xFFED5565)),
              ),
            ),
          );
        },
      ),
    );
  }
}
