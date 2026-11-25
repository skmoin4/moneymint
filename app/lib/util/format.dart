/// ₹ amounts in Indian digit grouping: 1,23,456.50
String inr(dynamic value, {bool decimals = true}) {
  final n = value is num ? value.toDouble() : double.tryParse(value?.toString() ?? '') ?? 0;
  final negative = n < 0;
  final fixed = n.abs().toStringAsFixed(decimals ? 2 : 0);
  final parts = fixed.split('.');
  var whole = parts[0];
  if (whole.length > 3) {
    final last3 = whole.substring(whole.length - 3);
    var rest = whole.substring(0, whole.length - 3);
    final groups = <String>[];
    while (rest.length > 2) {
      groups.insert(0, rest.substring(rest.length - 2));
      rest = rest.substring(0, rest.length - 2);
    }
    if (rest.isNotEmpty) groups.insert(0, rest);
    whole = '${groups.join(',')},$last3';
  }
  return '${negative ? '-' : ''}₹$whole${parts.length > 1 ? '.${parts[1]}' : ''}';
}

String _two(int v) => v.toString().padLeft(2, '0');

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// "25 Nov 2026, 4:05 PM" in the device's local time.
String dateTime(String iso) {
  final d = DateTime.tryParse(iso)?.toLocal();
  if (d == null) return iso;
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  return '${d.day} ${_months[d.month - 1]} ${d.year}, $h:${_two(d.minute)} ${d.hour < 12 ? 'AM' : 'PM'}';
}

double toDouble(dynamic v) => v is num ? v.toDouble() : double.tryParse(v?.toString() ?? '') ?? 0;
