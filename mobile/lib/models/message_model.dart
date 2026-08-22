enum MessageType { text, voice, file, system }

class MessageModel {
  final String id;
  final MessageType type;
  final String sender;
  final String avatar;
  final String? text;
  final String? audioPath;
  final String? fileName;
  final int? fileSize;
  final String? fileData;
  final DateTime timestamp;
  final int burnSeconds;
  final bool isSent;
  bool isBurned;

  MessageModel({
    required this.id,
    required this.type,
    required this.sender,
    required this.avatar,
    this.text,
    this.audioPath,
    this.fileName,
    this.fileSize,
    this.fileData,
    required this.timestamp,
    this.burnSeconds = 0,
    required this.isSent,
    this.isBurned = false,
  });

  factory MessageModel.fromJson(Map<String, dynamic> json, {bool isSent = false}) {
    MessageType t = MessageType.text;
    if (json['type'] == 'voice') t = MessageType.voice;
    if (json['type'] == 'file') t = MessageType.file;
    if (json['type'] == 'system') t = MessageType.system;

    return MessageModel(
      id: json['id']?.toString() ?? DateTime.now().millisecondsSinceEpoch.toString(),
      type: t,
      sender: json['sender']?.toString() ?? 'Peer',
      avatar: json['avatar']?.toString() ?? '🕵️',
      text: json['text']?.toString(),
      audioPath: json['audioPath']?.toString() ?? json['payload']?.toString(),
      fileName: json['fileName']?.toString() ?? json['file']?['name']?.toString(),
      fileSize: json['fileSize'] is int ? json['fileSize'] : json['file']?['size'] as int?,
      fileData: json['fileData']?.toString() ?? json['file']?['data']?.toString(),
      timestamp: json['timestamp'] != null
          ? DateTime.fromMillisecondsSinceEpoch(json['timestamp'] as int)
          : DateTime.now(),
      burnSeconds: int.tryParse(json['burn']?.toString() ?? '0') ?? 0,
      isSent: isSent,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'type': type.name,
      'sender': sender,
      'avatar': avatar,
      'text': text,
      'audioPath': audioPath,
      'fileName': fileName,
      'fileSize': fileSize,
      'fileData': fileData,
      'timestamp': timestamp.millisecondsSinceEpoch,
      'burn': burnSeconds,
      'isSent': isSent,
    };
  }
}
