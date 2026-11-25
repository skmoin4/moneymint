import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';

/// An error the backend reported (`{ "error": "..." }`), or a network failure.
class ApiException implements Exception {
  ApiException(this.message, {this.status});
  final String message;
  final int? status;

  bool get isUnauthorized => status == 401;

  @override
  String toString() => message;
}

/// Thin JSON client for the MoneyMint backend. Every request carries the session token
/// and `X-Client-Source: APP`, which tags transactions as coming from the mobile app.
class ApiClient {
  ApiClient({http.Client? client}) : _http = client ?? http.Client();

  final http.Client _http;
  String? token;

  /// Called when the server says the session is no longer valid (logged out elsewhere,
  /// account suspended), so the app can return to the login screen.
  void Function()? onUnauthorized;

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'X-Client-Source': 'APP',
    if (token != null) 'Authorization': 'Bearer $token',
  };

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final q = query?.map((k, v) => MapEntry(k, v?.toString() ?? ''))?..removeWhere((_, v) => v.isEmpty);
    return Uri.parse('$apiBaseUrl$path').replace(queryParameters: (q == null || q.isEmpty) ? null : q);
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) =>
      _send(() => _http.get(_uri(path, query), headers: _headers));

  Future<Map<String, dynamic>> post(String path, [Map<String, dynamic>? body]) =>
      _send(() => _http.post(_uri(path), headers: _headers, body: jsonEncode(body ?? {})));

  Future<Map<String, dynamic>> put(String path, [Map<String, dynamic>? body]) =>
      _send(() => _http.put(_uri(path), headers: _headers, body: jsonEncode(body ?? {})));

  Future<Map<String, dynamic>> _send(Future<http.Response> Function() request) async {
    http.Response res;
    try {
      res = await request().timeout(const Duration(seconds: 75));
    } catch (_) {
      throw ApiException('Could not reach the server. Check your internet connection.');
    }
    Map<String, dynamic> body = {};
    if (res.body.isNotEmpty) {
      try {
        final decoded = jsonDecode(res.body);
        if (decoded is Map<String, dynamic>) body = decoded;
      } catch (_) {
        // non-JSON body (e.g. a proxy error page)
      }
    }
    if (res.statusCode >= 200 && res.statusCode < 300) return body;

    if (res.statusCode == 401 && token != null) onUnauthorized?.call();
    throw ApiException(_errorMessage(body['error']) ?? 'Something went wrong (${res.statusCode})', status: res.statusCode);
  }

  /// Zod validation errors arrive as a JSON string of `{ fieldErrors: {...} }`.
  static String? _errorMessage(dynamic error) {
    if (error == null) return null;
    if (error is String) {
      if (error.startsWith('{')) {
        try {
          final parsed = jsonDecode(error) as Map<String, dynamic>;
          final fields = (parsed['fieldErrors'] as Map?) ?? {};
          final first = fields.values.whereType<List>().expand((e) => e).firstOrNull;
          final form = (parsed['formErrors'] as List?)?.firstOrNull;
          return (first ?? form)?.toString() ?? 'Please check the details you entered';
        } catch (_) {
          return error;
        }
      }
      return error;
    }
    return error.toString();
  }
}
