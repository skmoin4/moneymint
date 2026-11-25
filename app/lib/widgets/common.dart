import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../api/api_client.dart';
import '../state/session.dart';

const brand = Color(0xFF1AB394);
const brandDark = Color(0xFF138A72);
const sideDark = Color(0xFF2F4050);

Color statusColor(String status) => switch (status) {
  'SUCCESS' || 'PAID' || 'APPROVED' || 'RESOLVED' => const Color(0xFF1AB394),
  'FAILED' || 'REJECTED' => const Color(0xFFED5565),
  'REFUNDED' => const Color(0xFF23C6C8),
  _ => const Color(0xFFF8AC59),
};

class StatusBadge extends StatelessWidget {
  const StatusBadge(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: statusColor(status), borderRadius: BorderRadius.circular(4)),
      child: Text(
        status,
        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class ErrorBanner extends StatelessWidget {
  const ErrorBanner(this.message, {super.key});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: const Color(0xFFF2DEDE), borderRadius: BorderRadius.circular(6)),
      child: Text(message, style: const TextStyle(color: Color(0xFFA94442))),
    );
  }
}

class InfoBanner extends StatelessWidget {
  const InfoBanner(this.message, {super.key});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: const Color(0xFFDFF0D8), borderRadius: BorderRadius.circular(6)),
      child: Text(message, style: const TextStyle(color: Color(0xFF3C763D))),
    );
  }
}

/// Full-width primary button with a spinner while [loading].
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, required this.onPressed, this.loading = false});
  final String label;
  final VoidCallback? onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: FilledButton(
        onPressed: loading ? null : onPressed,
        child: loading
            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
            : Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      ),
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 16, 4, 8),
      child: Row(
        children: [
          Expanded(
            child: Text(text, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
          ),
          ?trailing,
        ],
      ),
    );
  }
}

/// Picks one item from a list in a bottom sheet — used instead of dropdowns for long lists.
Future<T?> pickFromList<T>(
  BuildContext context, {
  required String title,
  required List<T> items,
  required String Function(T) label,
  String Function(T)? subtitle,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.6,
      maxChildSize: 0.9,
      builder: (ctx, scroll) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(title, style: Theme.of(ctx).textTheme.titleMedium),
          ),
          Expanded(
            child: ListView.separated(
              controller: scroll,
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (ctx, i) => ListTile(
                title: Text(label(items[i])),
                subtitle: subtitle == null ? null : Text(subtitle(items[i])),
                onTap: () => Navigator.pop(ctx, items[i]),
              ),
            ),
          ),
        ],
      ),
    ),
  );
}

/// If the user has a transaction PIN enabled, asks for it. Returns:
/// - null when no PIN is needed, the PIN string when entered, or throws [PinCancelled].
class PinCancelled implements Exception {}

Future<String?> askPinIfEnabled(BuildContext context) async {
  final api = context.read<Session>().api;
  final status = await api.get('/auth/pin/status');
  if (status['pinEnabled'] != true) return null;
  if (!context.mounted) throw PinCancelled();
  final controller = TextEditingController();
  final pin = await showDialog<String>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Enter transaction PIN'),
      content: TextField(
        controller: controller,
        autofocus: true,
        obscureText: true,
        keyboardType: TextInputType.number,
        maxLength: 6,
        decoration: const InputDecoration(hintText: '4–6 digit PIN'),
        onSubmitted: (v) => Navigator.pop(ctx, v),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(ctx, controller.text), child: const Text('Confirm')),
      ],
    ),
  );
  if (pin == null || pin.isEmpty) throw PinCancelled();
  return pin;
}

String errorOf(Object e) => e is ApiException ? e.message : 'Something went wrong';
