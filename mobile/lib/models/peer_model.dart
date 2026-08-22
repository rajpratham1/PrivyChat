class PeerModel {
  final String id;
  final String nickname;
  final String avatar;
  final String mode; // 'wifi', 'ble', 'qr'
  final String device;
  final Map<String, dynamic>? publicKey;
  final int signalStrength;

  PeerModel({
    required this.id,
    required this.nickname,
    required this.avatar,
    this.mode = 'wifi',
    this.device = 'Mobile',
    this.publicKey,
    this.signalStrength = 98,
  });

  factory PeerModel.fromJson(Map<String, dynamic> json) {
    return PeerModel(
      id: json['id']?.toString() ?? '',
      nickname: json['nickname']?.toString() ?? 'Agent',
      avatar: json['avatar']?.toString() ?? '🕵️',
      mode: json['mode']?.toString() ?? 'wifi',
      device: json['device']?.toString() ?? 'Mobile',
      publicKey: json['publicKey'] != null ? Map<String, dynamic>.from(json['publicKey']) : null,
      signalStrength: json['signalStrength'] is int ? json['signalStrength'] : 98,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'nickname': nickname,
      'avatar': avatar,
      'mode': mode,
      'device': device,
      'publicKey': publicKey,
      'signalStrength': signalStrength,
    };
  }
}
