/// Backend base URL. Set at build time:
///   flutter run --dart-define=API_URL=https://api.yourdomain.com
/// Android emulator talking to a backend on the same PC: http://10.0.2.2:4000
const String apiBaseUrl = String.fromEnvironment('API_URL', defaultValue: 'http://localhost:4000');

const String appName = 'MoneyMint';
