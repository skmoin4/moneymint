import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/api_client.dart';
import '../util/format.dart';

class SessionUser {
  SessionUser({required this.id, required this.name, required this.phone, required this.role});
  final String id;
  final String name;
  final String phone;
  final String role;

  factory SessionUser.fromJson(Map<String, dynamic> j) =>
      SessionUser(id: j['id'] as String, name: j['name'] as String, phone: j['phone'] as String, role: j['role'] as String);
}

/// Logged-in state: token (kept in secure storage), user and wallet balance.
class Session extends ChangeNotifier {
  Session(this.api) {
    api.onUnauthorized = () => logout();
  }

  final ApiClient api;
  final _storage = const FlutterSecureStorage();
  static const _tokenKey = 'session_token';

  SessionUser? user;
  double balance = 0;
  bool restoring = true;

  bool get loggedIn => user != null;

  /// On app start: reuse a saved token if the server still accepts it.
  Future<void> restore() async {
    try {
      final saved = await _storage.read(key: _tokenKey);
      if (saved != null) {
        api.token = saved;
        final me = await api.get('/auth/me');
        user = SessionUser.fromJson(me);
        balance = toDouble(me['walletBalance']);
      }
    } catch (_) {
      api.token = null;
      await _storage.delete(key: _tokenKey);
    } finally {
      restoring = false;
      notifyListeners();
    }
  }

  Future<int> requestOtp(String phone) async {
    final res = await api.post('/auth/otp/request', {'phone': phone});
    return (res['expiresInSeconds'] as num?)?.toInt() ?? 300;
  }

  Future<void> verifyOtp(String phone, String otp) async {
    final res = await api.post('/auth/otp/verify', {'phone': phone, 'otp': otp});
    await _start(res);
  }

  Future<void> loginWithPassword(String phone, String password) async {
    final res = await api.post('/auth/login', {'phone': phone, 'password': password});
    await _start(res);
  }

  Future<void> _start(Map<String, dynamic> res) async {
    api.token = res['token'] as String;
    await _storage.write(key: _tokenKey, value: api.token);
    user = SessionUser.fromJson(res['user'] as Map<String, dynamic>);
    await refreshBalance(notify: false);
    notifyListeners();
  }

  Future<void> refreshBalance({bool notify = true}) async {
    try {
      final res = await api.get('/wallet/balance');
      balance = toDouble(res['balance']);
      if (notify) notifyListeners();
    } catch (_) {
      // keep the last known balance
    }
  }

  Future<void> logout({bool allDevices = false}) async {
    if (allDevices) {
      try {
        await api.post('/auth/logout-all');
      } catch (_) {}
    }
    api.token = null;
    user = null;
    balance = 0;
    await _storage.delete(key: _tokenKey);
    notifyListeners();
  }
}
