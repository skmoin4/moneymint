import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../state/session.dart';
import '../util/format.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  List<Map<String, dynamic>>? _items;

  @override
  void initState() {
    super.initState();
    final api = context.read<Session>().api;
    api.get('/broadcast/my-notifications').then((res) {
      if (!mounted) return;
      setState(() => _items = (res['notifications'] as List).cast<Map<String, dynamic>>());
      if ((res['unreadCount'] as num? ?? 0) > 0) api.post('/broadcast/my-notifications/mark-read');
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: _items == null
          ? const Center(child: CircularProgressIndicator())
          : _items!.isEmpty
          ? const Center(child: Text('No notifications yet'))
          : ListView.separated(
              itemCount: _items!.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (_, i) => Container(
                color: _items![i]['isRead'] == true ? Colors.white : const Color(0xFFE8F7F3),
                child: ListTile(title: Text('${_items![i]['message']}'), subtitle: Text(dateTime('${_items![i]['createdAt']}'))),
              ),
            ),
    );
  }
}
