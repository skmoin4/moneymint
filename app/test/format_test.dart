import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:moneymint_app/api/api_client.dart';
import 'package:moneymint_app/util/format.dart';

void main() {
  group('inr', () {
    test('uses Indian digit grouping', () {
      expect(inr(0), '₹0.00');
      expect(inr(999), '₹999.00');
      expect(inr(1000), '₹1,000.00');
      expect(inr(123456.5), '₹1,23,456.50');
      expect(inr(10000000), '₹1,00,00,000.00');
      expect(inr('2020'), '₹2,020.00');
      expect(inr(-1500), '-₹1,500.00');
      expect(inr(199, decimals: false), '₹199');
    });
  });

  group('ApiClient', () {
    test('surfaces the server error message', () async {
      final api = ApiClient(client: MockClient((_) async => http.Response('{"error":"Insufficient balance"}', 400)));
      expect(() => api.post('/recharge', {}), throwsA(isA<ApiException>().having((e) => e.message, 'message', 'Insufficient balance')));
    });

    test('reads the first field error from a validation error', () async {
      final body = '{"error":"{\\"formErrors\\":[],\\"fieldErrors\\":{\\"pin\\":[\\"PIN must be 4-6 digits\\"]}}"}';
      final api = ApiClient(client: MockClient((_) async => http.Response(body, 400)));
      expect(() => api.post('/auth/pin/set', {}), throwsA(isA<ApiException>().having((e) => e.message, 'message', 'PIN must be 4-6 digits')));
    });

    test('sends the token and the APP source header, and reports 401', () async {
      late http.Request seen;
      var unauthorized = false;
      final api = ApiClient(client: MockClient((req) async {
        seen = req;
        return http.Response('{"error":"Session expired"}', 401);
      }))
        ..token = 't0k'
        ..onUnauthorized = () => unauthorized = true;
      await expectLater(api.get('/wallet/balance'), throwsA(isA<ApiException>()));
      expect(seen.headers['Authorization'], 'Bearer t0k');
      expect(seen.headers['X-Client-Source'], 'APP');
      expect(unauthorized, isTrue);
    });
  });
}
