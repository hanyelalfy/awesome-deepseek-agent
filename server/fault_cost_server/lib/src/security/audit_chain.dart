import 'dart:convert';

import 'package:crypto/crypto.dart';

class AuditRecord {
  const AuditRecord._({
    required this.id,
    required this.actorId,
    required this.action,
    required this.entity,
    required this.entityId,
    required this.createdAt,
    required this.payload,
    required this.previousHash,
    required this.hash,
  });

  factory AuditRecord.create({
    required String id,
    required String actorId,
    required String action,
    required String entity,
    required String entityId,
    required DateTime createdAt,
    required Map<String, Object?> payload,
    String? previousHash,
  }) {
    if ([id, actorId, action, entity, entityId].any((value) => value.trim().isEmpty)) {
      throw ArgumentError('Audit record identifiers and action are required.');
    }
    if (!createdAt.isUtc) {
      throw ArgumentError.value(createdAt, 'createdAt', 'must be in UTC');
    }
    final immutablePayload = _normalizePayload(payload);
    final hash = _calculateHash(
      id: id,
      actorId: actorId,
      action: action,
      entity: entity,
      entityId: entityId,
      createdAt: createdAt,
      payload: immutablePayload,
      previousHash: previousHash,
    );
    return AuditRecord._(
      id: id,
      actorId: actorId,
      action: action,
      entity: entity,
      entityId: entityId,
      createdAt: createdAt,
      payload: immutablePayload,
      previousHash: previousHash,
      hash: hash,
    );
  }

  final String id;
  final String actorId;
  final String action;
  final String entity;
  final String entityId;
  final DateTime createdAt;
  final Map<String, Object?> payload;
  final String? previousHash;
  final String hash;

  bool get hasValidHash =>
      hash ==
      _calculateHash(
        id: id,
        actorId: actorId,
        action: action,
        entity: entity,
        entityId: entityId,
        createdAt: createdAt,
        payload: payload,
        previousHash: previousHash,
      );

  static String _calculateHash({
    required String id,
    required String actorId,
    required String action,
    required String entity,
    required String entityId,
    required DateTime createdAt,
    required Map<String, Object?> payload,
    required String? previousHash,
  }) {
    final canonicalRecord = jsonEncode({
      'id': id,
      'actorId': actorId,
      'action': action,
      'entity': entity,
      'entityId': entityId,
      'createdAt': createdAt.toIso8601String(),
      'payload': payload,
      'previousHash': previousHash,
    });
    return sha256.convert(utf8.encode(canonicalRecord)).toString();
  }

  static Map<String, Object?> _normalizePayload(Map<String, Object?> payload) =>
      _normalizeJsonValue(payload) as Map<String, Object?>;

  static Object? _normalizeJsonValue(Object? value) {
    if (value == null || value is String || value is bool) {
      return value;
    }
    if (value is num) {
      if (!value.isFinite) {
        throw ArgumentError.value(value, 'payload', 'numbers must be finite');
      }
      return value;
    }
    if (value is List<Object?>) {
      return List<Object?>.unmodifiable(value.map(_normalizeJsonValue));
    }
    if (value is Map<Object?, Object?>) {
      if (value.keys.any((key) => key is! String)) {
        throw ArgumentError.value(value, 'payload', 'object keys must be strings');
      }
      final normalized = <String, Object?>{};
      for (final key in value.keys.cast<String>().toList()..sort()) {
        normalized[key] = _normalizeJsonValue(value[key]);
      }
      return Map<String, Object?>.unmodifiable(normalized);
    }
    throw ArgumentError.value(value, 'payload', 'must contain only JSON-compatible values');
  }
}

class AuditChain {
  const AuditChain._();

  static bool verify(Iterable<AuditRecord> records) {
    String? previousHash;
    for (final record in records) {
      if (record.previousHash != previousHash || !record.hasValidHash) {
        return false;
      }
      previousHash = record.hash;
    }
    return true;
  }
}
