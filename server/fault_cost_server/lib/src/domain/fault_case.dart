enum Department {
  loading,
  sorting,
  generalMaintenance,
  shanfara,
  electrical,
}

enum ResponsibleTeam {
  loading,
  sorting,
  generalMaintenance,
  shanfara,
  electrical,
  warehouse,
  production,
  quality,
  supplier,
  system,
  other,
}

enum FaultRole {
  technician,
  costMonitor,
  warehouse,
  maintenanceManager,
  productionManager,
  administrator,
}

enum FaultStatus {
  open,
  pendingWait,
  assigned,
  arrived,
  partWait,
  repairing,
  obstacleWait,
  testing,
  closureReview,
  closed,
}

enum FaultStage {
  assignmentWait,
  response,
  diagnosis,
  partWait,
  repair,
  obstacle,
  testing,
  closureReview,
}

class Technician {
  const Technician({
    required this.id,
    required this.department,
    required this.skillLevel,
    required this.isAvailable,
    required this.isOnShift,
  });

  final String id;
  final Department department;
  final int skillLevel;
  final bool isAvailable;
  final bool isOnShift;
}

class FaultInterval {
  const FaultInterval({
    required this.stage,
    required this.startedAt,
    this.endedAt,
    this.reasonCode,
    this.responsibleTeam,
  });

  final FaultStage stage;
  final DateTime startedAt;
  final DateTime? endedAt;
  final String? reasonCode;
  final ResponsibleTeam? responsibleTeam;

  Duration durationAt(DateTime at) {
    final end = endedAt ?? at;
    if (end.isBefore(startedAt)) {
      throw ArgumentError.value(at, 'at', 'must not precede the interval');
    }
    return end.difference(startedAt);
  }

  FaultInterval endAt(DateTime at) {
    if (endedAt != null) {
      throw StateError('The interval is already closed.');
    }
    if (at.isBefore(startedAt)) {
      throw ArgumentError.value(at, 'at', 'must not precede the interval');
    }
    return FaultInterval(
      stage: stage,
      startedAt: startedAt,
      endedAt: at,
      reasonCode: reasonCode,
      responsibleTeam: responsibleTeam,
    );
  }
}

class FaultCase {
  FaultCase._({
    required this.id,
    required this.machineId,
    required this.partId,
    required this.reportedById,
    required this.requiredDepartment,
    required this.severity,
    required this.machineCriticality,
    required this.reportedAt,
    required this.status,
    required List<FaultInterval> intervals,
    this.assignedTechnicianId,
    this.assignedAt,
    this.arrivedAt,
    this.repairEndedAt,
    this.testedAt,
    this.closedAt,
    this.rootCauseCode,
    this.resumeStage,
    this.obstacleReasonCode,
  }) : intervals = List.unmodifiable(intervals);

  factory FaultCase.open({
    required String id,
    required String machineId,
    String? partId,
    required String reportedById,
    required Department requiredDepartment,
    required int severity,
    required int machineCriticality,
    required DateTime reportedAt,
  }) {
    _requireUtc(reportedAt, 'reportedAt');
    final identifiers = <String>[id, machineId, reportedById, if (partId != null) partId];
    if (identifiers.any((value) => value.trim().isEmpty || value != value.trim())) {
      throw ArgumentError('Fault, machine, and reporter IDs are required.');
    }
    if (severity < 1 || severity > 5) {
      throw ArgumentError.value(severity, 'severity', 'must be between 1 and 5');
    }
    if (machineCriticality < 1 || machineCriticality > 5) {
      throw ArgumentError.value(
        machineCriticality,
        'machineCriticality',
        'must be between 1 and 5',
      );
    }
    return FaultCase._(
      id: id,
      machineId: machineId,
      partId: partId,
      reportedById: reportedById,
      requiredDepartment: requiredDepartment,
      severity: severity,
      machineCriticality: machineCriticality,
      reportedAt: reportedAt,
      status: FaultStatus.open,
      intervals: [FaultInterval(stage: FaultStage.assignmentWait, startedAt: reportedAt)],
    );
  }

  final String id;
  final String machineId;
  final String? partId;
  final String reportedById;
  final Department requiredDepartment;
  final int severity;
  final int machineCriticality;
  final DateTime reportedAt;
  final FaultStatus status;
  final List<FaultInterval> intervals;
  final String? assignedTechnicianId;
  final DateTime? assignedAt;
  final DateTime? arrivedAt;
  final DateTime? repairEndedAt;
  final DateTime? testedAt;
  final DateTime? closedAt;
  final String? rootCauseCode;
  final FaultStage? resumeStage;
  final String? obstacleReasonCode;

  int get priorityScore => severity * machineCriticality;

  FaultStage get currentStage => intervals.last.stage;

  bool get isClosed => status == FaultStatus.closed;

  FaultCase queue() {
    if (status != FaultStatus.open) {
      throw StateError('Only a newly opened fault can enter the pending queue.');
    }
    return _copy(status: FaultStatus.pendingWait);
  }

  FaultCase assign({
    required Technician technician,
    required DateTime at,
  }) {
    _requireUtc(at, 'at');
    if (status != FaultStatus.open && status != FaultStatus.pendingWait) {
      throw StateError('Only an unassigned fault can be assigned.');
    }
    if (technician.department != requiredDepartment) {
      throw StateError('Technician department does not match the fault.');
    }
    if (technician.id.trim().isEmpty || technician.skillLevel < 1 || technician.skillLevel > 5) {
      throw ArgumentError('Technician ID and skill level must be valid.');
    }
    if (!technician.isAvailable || !technician.isOnShift) {
      throw StateError('Technician must be available and on shift.');
    }
    return _move(
      to: FaultStage.response,
      at: at,
      status: FaultStatus.assigned,
      assignedTechnicianId: technician.id,
      assignedAt: at,
    );
  }

  FaultCase arrive({required DateTime at}) {
    _requireStatus(FaultStatus.assigned);
    _requireUtc(at, 'at');
    return _move(to: FaultStage.diagnosis, at: at, status: FaultStatus.arrived, arrivedAt: at);
  }

  FaultCase startRepair({required DateTime at}) {
    _requireStatus(FaultStatus.arrived);
    _requireUtc(at, 'at');
    return _move(to: FaultStage.repair, at: at, status: FaultStatus.repairing);
  }

  FaultCase requestPart({required DateTime at}) {
    if (status != FaultStatus.arrived && status != FaultStatus.repairing) {
      throw StateError('A part can only be requested during diagnosis or repair.');
    }
    _requireUtc(at, 'at');
    return _move(
      to: FaultStage.partWait,
      at: at,
      status: FaultStatus.partWait,
      resumeStage: currentStage,
    );
  }

  FaultCase partArrived({required DateTime at}) {
    _requireStatus(FaultStatus.partWait);
    _requireUtc(at, 'at');
    final resume = resumeStage;
    if (resume != FaultStage.diagnosis && resume != FaultStage.repair) {
      throw StateError('No valid activity is recorded to resume after the part arrives.');
    }
    return _move(
      to: resume,
      at: at,
      status: resume == FaultStage.repair ? FaultStatus.repairing : FaultStatus.arrived,
      resumeStage: null,
    );
  }

  FaultCase startObstacle({
    required String reasonCode,
    required ResponsibleTeam responsibleTeam,
    required DateTime at,
  }) {
    if (status == FaultStatus.open ||
        status == FaultStatus.pendingWait ||
        status == FaultStatus.closed ||
        status == FaultStatus.obstacleWait ||
        status == FaultStatus.partWait ||
        status == FaultStatus.closureReview) {
      throw StateError('An obstacle requires an active assigned fault.');
    }
    _requireUtc(at, 'at');
    if (reasonCode.trim().isEmpty) {
      throw ArgumentError.value(reasonCode, 'reasonCode', 'is required');
    }
    return _move(
      to: FaultStage.obstacle,
      at: at,
      status: FaultStatus.obstacleWait,
      resumeStage: currentStage,
      obstacleReasonCode: reasonCode.trim(),
      intervalReasonCode: reasonCode.trim(),
      responsibleTeam: responsibleTeam,
    );
  }

  FaultCase resolveObstacle({required DateTime at}) {
    _requireStatus(FaultStatus.obstacleWait);
    _requireUtc(at, 'at');
    final resume = resumeStage;
    if (resume == null || resume == FaultStage.obstacle) {
      throw StateError('No activity is recorded to resume after the obstacle.');
    }
    return _move(
      to: resume,
      at: at,
      status: _statusFor(resume),
      resumeStage: null,
      obstacleReasonCode: null,
    );
  }

  FaultCase finishRepair({required DateTime at}) {
    _requireStatus(FaultStatus.repairing);
    _requireUtc(at, 'at');
    return _move(to: FaultStage.testing, at: at, status: FaultStatus.testing, repairEndedAt: at);
  }

  FaultCase finishTesting({required DateTime at}) {
    _requireStatus(FaultStatus.testing);
    _requireUtc(at, 'at');
    return _move(
      to: FaultStage.closureReview,
      at: at,
      status: FaultStatus.closureReview,
      testedAt: at,
    );
  }

  FaultCase close({
    required FaultRole actorRole,
    required String rootCauseCode,
    required DateTime at,
  }) {
    _requireStatus(FaultStatus.closureReview);
    _requireUtc(at, 'at');
    if (actorRole != FaultRole.costMonitor) {
      throw StateError('Only a cost monitor may approve closure.');
    }
    if (rootCauseCode.trim().isEmpty) {
      throw ArgumentError.value(rootCauseCode, 'rootCauseCode', 'is required');
    }
    final completed = _endCurrent(at);
    return completed._copy(
      status: FaultStatus.closed,
      closedAt: at,
      rootCauseCode: rootCauseCode.trim(),
    );
  }

  Duration durationFor(FaultStage stage, {required DateTime asOf}) {
    _requireUtc(asOf, 'asOf');
    return intervals
        .where((interval) => interval.stage == stage)
        .fold(Duration.zero, (sum, interval) => sum + interval.durationAt(asOf));
  }

  Duration get totalDowntime {
    final end = closedAt;
    if (end == null) {
      throw StateError('Total downtime is final only after the fault is closed.');
    }
    return end.difference(reportedAt);
  }

  FaultCase _move({
    required FaultStage to,
    required DateTime at,
    required FaultStatus status,
    String? assignedTechnicianId,
    DateTime? assignedAt,
    DateTime? arrivedAt,
    DateTime? repairEndedAt,
    DateTime? testedAt,
    FaultStage? resumeStage,
    String? obstacleReasonCode,
    String? intervalReasonCode,
    ResponsibleTeam? responsibleTeam,
  }) {
    final ended = _endCurrent(at);
    return ended._copy(
      status: status,
      assignedTechnicianId: assignedTechnicianId ?? this.assignedTechnicianId,
      assignedAt: assignedAt ?? this.assignedAt,
      arrivedAt: arrivedAt ?? this.arrivedAt,
      repairEndedAt: repairEndedAt ?? this.repairEndedAt,
      testedAt: testedAt ?? this.testedAt,
      resumeStage: resumeStage,
      obstacleReasonCode: obstacleReasonCode,
      intervals: [
        ...ended.intervals,
        FaultInterval(
          stage: to,
          startedAt: at,
          reasonCode: intervalReasonCode,
          responsibleTeam: responsibleTeam,
        ),
      ],
    );
  }

  FaultCase _endCurrent(DateTime at) {
    _requireUtc(at, 'at');
    final current = intervals.last;
    if (current.endedAt != null) {
      throw StateError('There is no active interval to close.');
    }
    final ended = [...intervals];
    ended[ended.length - 1] = current.endAt(at);
    return _copy(intervals: ended);
  }

  FaultCase _copy({
    FaultStatus? status,
    List<FaultInterval>? intervals,
    String? assignedTechnicianId,
    DateTime? assignedAt,
    DateTime? arrivedAt,
    DateTime? repairEndedAt,
    DateTime? testedAt,
    DateTime? closedAt,
    String? rootCauseCode,
    FaultStage? resumeStage,
    String? obstacleReasonCode,
  }) =>
      FaultCase._(
        id: id,
        machineId: machineId,
        partId: partId,
        reportedById: reportedById,
        requiredDepartment: requiredDepartment,
        severity: severity,
        machineCriticality: machineCriticality,
        reportedAt: reportedAt,
        status: status ?? this.status,
        intervals: List.unmodifiable(intervals ?? this.intervals),
        assignedTechnicianId: assignedTechnicianId ?? this.assignedTechnicianId,
        assignedAt: assignedAt ?? this.assignedAt,
        arrivedAt: arrivedAt ?? this.arrivedAt,
        repairEndedAt: repairEndedAt ?? this.repairEndedAt,
        testedAt: testedAt ?? this.testedAt,
        closedAt: closedAt ?? this.closedAt,
        rootCauseCode: rootCauseCode ?? this.rootCauseCode,
        resumeStage: resumeStage,
        obstacleReasonCode: obstacleReasonCode,
      );

  void _requireStatus(FaultStatus expected) {
    if (status != expected) {
      throw StateError('Expected status $expected, found $status.');
    }
  }

  static FaultStatus _statusFor(FaultStage stage) => switch (stage) {
        FaultStage.response => FaultStatus.assigned,
        FaultStage.diagnosis => FaultStatus.arrived,
        FaultStage.partWait => FaultStatus.partWait,
        FaultStage.repair => FaultStatus.repairing,
        FaultStage.obstacle => FaultStatus.obstacleWait,
        FaultStage.testing => FaultStatus.testing,
        FaultStage.closureReview => FaultStatus.closureReview,
        FaultStage.assignmentWait => FaultStatus.pendingWait,
      };

  static void _requireUtc(DateTime value, String name) {
    if (!value.isUtc) {
      throw ArgumentError.value(value, name, 'must be in UTC');
    }
  }
}
