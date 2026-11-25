import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../state/session.dart';
import '../widgets/common.dart';

/// Mobile number + OTP login (the app's main channel), with password as a fallback.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  final _password = TextEditingController();
  bool _otpSent = false;
  bool _usePassword = false;
  bool _busy = false;
  String? _error;
  int _resendIn = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _phone.dispose();
    _otp.dispose();
    _password.dispose();
    super.dispose();
  }

  bool get _phoneValid => RegExp(r'^\d{10}$').hasMatch(_phone.text.trim());

  void _startResendTimer() {
    _timer?.cancel();
    setState(() => _resendIn = 45);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _resendIn = _resendIn > 0 ? _resendIn - 1 : 0);
      if (_resendIn == 0) t.cancel();
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
    } catch (e) {
      if (mounted) setState(() => _error = errorOf(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _sendOtp() => _run(() async {
    await context.read<Session>().requestOtp(_phone.text.trim());
    setState(() => _otpSent = true);
    _startResendTimer();
  });

  Future<void> _verify() => _run(() => context.read<Session>().verifyOtp(_phone.text.trim(), _otp.text.trim()));

  Future<void> _passwordLogin() => _run(() => context.read<Session>().loginWithPassword(_phone.text.trim(), _password.text));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const _Logo(),
                  const SizedBox(height: 32),
                  Text(
                    _usePassword ? 'Login with password' : 'Login with OTP',
                    style: Theme.of(context).textTheme.headlineSmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 24),
                  if (_error != null) ErrorBanner(_error!),
                  TextField(
                    controller: _phone,
                    enabled: !_otpSent,
                    keyboardType: TextInputType.phone,
                    maxLength: 10,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: const InputDecoration(labelText: 'Mobile number', prefixText: '+91 ', counterText: ''),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: 16),
                  if (_usePassword) ...[
                    TextField(
                      controller: _password,
                      obscureText: true,
                      decoration: const InputDecoration(labelText: 'Password'),
                      onSubmitted: (_) => _passwordLogin(),
                    ),
                    const SizedBox(height: 16),
                    PrimaryButton(label: 'Login', loading: _busy, onPressed: _phoneValid ? _passwordLogin : null),
                  ] else if (!_otpSent) ...[
                    PrimaryButton(label: 'Send OTP', loading: _busy, onPressed: _phoneValid ? _sendOtp : null),
                  ] else ...[
                    TextField(
                      controller: _otp,
                      autofocus: true,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                      decoration: InputDecoration(labelText: 'OTP sent to +91 ${_phone.text}', counterText: ''),
                      onChanged: (v) {
                        setState(() {});
                        if (v.length == 6) _verify();
                      },
                    ),
                    const SizedBox(height: 16),
                    PrimaryButton(label: 'Verify & Login', loading: _busy, onPressed: _otp.text.length == 6 ? _verify : null),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        TextButton(
                          onPressed: () => setState(() {
                            _otpSent = false;
                            _otp.clear();
                          }),
                          child: const Text('Change number'),
                        ),
                        TextButton(
                          onPressed: _resendIn > 0 || _busy ? null : _sendOtp,
                          child: Text(_resendIn > 0 ? 'Resend in ${_resendIn}s' : 'Resend OTP'),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () => setState(() {
                      _usePassword = !_usePassword;
                      _otpSent = false;
                      _error = null;
                    }),
                    child: Text(_usePassword ? 'Login with OTP instead' : 'Login with password instead'),
                  ),
                  const SizedBox(height: 24),
                  Text(
                    "Don't have an account? Contact your distributor.",
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey.shade600),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Logo extends StatelessWidget {
  const _Logo();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 84,
          height: 84,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: sideDark,
            border: Border.all(color: brand, width: 3),
          ),
          child: const Text(
            '₹M',
            style: TextStyle(color: brand, fontSize: 30, fontWeight: FontWeight.bold),
          ),
        ),
        const SizedBox(height: 12),
        RichText(
          text: const TextSpan(
            style: TextStyle(fontSize: 26, fontWeight: FontWeight.w600, color: sideDark),
            children: [
              TextSpan(text: 'Money'),
              TextSpan(
                text: 'Mint',
                style: TextStyle(color: brand),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
