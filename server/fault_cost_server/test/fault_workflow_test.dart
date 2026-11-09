import 'package:fault_cost_server/fault_cost_server.dart';
import 'package:test/test.dart';

void main() {
  final reportedAt = DateTime.utc(2026, 11, 9, 8);

  FaultCase openFault({
    String id = 'F-1',
    Department department = Department.electrical,
    int severity = 4,
  }) =>
      FaultCase.open(
        id: id,
        machineId: 'M-1',
        partId: 'P-1',
        reportedById: 'monitor-1',
        requiredDepartment: department,
        severity: severity,
        machineCriticality: 5,
        reportedAt: reportedAt,
      );

  Technician technician({
    String id = 'tech-1',
    required Department department,
  }) =>
      Technician(
        id: id,
        department: department,
        skillLevel: 4,
        isAvailable: true,
        isOnShift: true,
      );

  test('tracks non-overlapping stages through queue, parts, repair, and approval', () {
    final closed = openFault()
        .queue()
        .assign(
          technician: technician(department: Department.electrical),
          at: reportedAt.add(const Duration(minutes: 5)),
        )
        .arrive(at: reportedAt.add(const Duration(minutes: 12)))
        .requestPart(at: reportedAt.add(const Duration(minutes: 20)))
        .partArrived(at: reportedAt.add(const Duration(minutes: 50)))
        .startRepair(at: reportedAt.add(const Duration(minutes: 50)))
        .finishRepair(at: reportedAt.add(const Duration(minutes: 80)))
        .finishTesting(at: reportedAt.add(const Duration(minutes: 90)))
        .close(
          actorRole: FaultRole.costMonitor,
          rootCauseCode: 'PART_FAILURE',
          at: reportedAt.add(const Duration(minutes: 92)),
        );

    expect(closed.status, FaultStatus.closed);
    expect(closed.totalDowntime, const Duration(minutes: 92));
    expect(
      closed.durationFor(FaultStage.assignmentWait, asOf: closed.closedAt!),
      const Duration(minutes: 5),
    );
    expect(
      closed.durationFor(FaultStage.response, asOf: closed.closedAt!),
      const Duration(minutes: 7),
    );
    expect(
      closed.durationFor(FaultStage.diagnosis, asOf: closed.closedAt!),
      const Duration(minutes: 8),
    );
    expect(
      closed.durationFor(FaultStage.partWait, asOf: closed.closedAt!),
      const Duration(minutes: 30),
    );
    expect(
      closed.durationFor(FaultStage.repair, asOf: closed.closedAt!),
      const Duration(minutes: 30),
    );
    expect(
      closed.durationFor(FaultStage.testing, asOf: closed.closedAt!),
      const Duration(minutes: 10),
    );
    expect(
      closed.durationFor(FaultStage.closureReview, asOf: closed.closedAt!),
      const Duration(minutes: 2),
    );
    final tracked = FaultStage.values.fold(
      Duration.zero,
      (sum, stage) => sum + closed.durationFor(stage, asOf: closed.closedAt!),
    );
    expect(tracked, closed.totalDowntime);
  });

  test('pauses and resumes repair around parts and obstacles without double counting', () {
    final closed = openFault()
        .assign(
          technician: technician(department: Department.electrical),
          at: reportedAt.add(const Duration(minutes: 1)),
        )
        .arrive(at: reportedAt.add(const Duration(minutes: 2)))
        .startRepair(at: reportedAt.add(const Duration(minutes: 3)))
        .requestPart(at: reportedAt.add(const Duration(minutes: 8)))
        .partArrived(at: reportedAt.add(const Duration(minutes: 18)))
        .startObstacle(
          reasonCode: 'CORROSION',
          responsibleTeam: ResponsibleTeam.generalMaintenance,
          at: reportedAt.add(const Duration(minutes: 20)),
        )
        .resolveObstacle(at: reportedAt.add(const Duration(minutes: 25)))
        .finishRepair(at: reportedAt.add(const Duration(minutes: 30)))
        .finishTesting(at: reportedAt.add(const Duration(minutes: 35)))
        .close(
          actorRole: FaultRole.costMonitor,
          rootCauseCode: 'CORROSION',
          at: reportedAt.add(const Duration(minutes: 36)),
        );

    expect(
      closed.durationFor(FaultStage.repair, asOf: closed.closedAt!),
      const Duration(minutes: 10),
    );
    expect(
      closed.durationFor(FaultStage.partWait, asOf: closed.closedAt!),
      const Duration(minutes: 10),
    );
    expect(
      closed.durationFor(FaultStage.obstacle, asOf: closed.closedAt!),
      const Duration(minutes: 5),
    );
    expect(
      closed.intervals.where((interval) => interval.stage == FaultStage.obstacle).single.reasonCode,
      'CORROSION',
    );
    expect(
      closed.intervals.where((interval) => interval.stage == FaultStage.obstacle).single.responsibleTeam,
      ResponsibleTeam.generalMaintenance,
    );
  });

  test('keeps waiting faults out of department response time', () {
    final pending = openFault().queue();
    expect(pending.status, FaultStatus.pendingWait);
    expect(pending.durationFor(FaultStage.assignmentWait, asOf: reportedAt.add(const Duration(hours: 2))),
        const Duration(hours: 2));
    expect(pending.assignedAt, isNull);
  });

  test('rejects a technician from another department', () {
    expect(
      () => openFault().assign(
        technician: technician(department: Department.loading),
        at: reportedAt.add(const Duration(minutes: 1)),
      ),
      throwsStateError,
    );
  });

  test('only a cost monitor can approve closure', () {
    final readyToClose = openFault()
        .assign(
          technician: technician(department: Department.electrical),
          at: reportedAt.add(const Duration(minutes: 1)),
        )
        .arrive(at: reportedAt.add(const Duration(minutes: 2)))
        .startRepair(at: reportedAt.add(const Duration(minutes: 3)))
        .finishRepair(at: reportedAt.add(const Duration(minutes: 4)))
        .finishTesting(at: reportedAt.add(const Duration(minutes: 5)));

    expect(
      () => readyToClose.close(
        actorRole: FaultRole.technician,
        rootCauseCode: 'PART_FAILURE',
        at: reportedAt.add(const Duration(minutes: 6)),
      ),
      throwsStateError,
    );
    expect(
      () => readyToClose.close(
        actorRole: FaultRole.administrator,
        rootCauseCode: 'PART_FAILURE',
        at: reportedAt.add(const Duration(minutes: 6)),
      ),
      throwsStateError,
    );
    expect(
      () => readyToClose.close(
        actorRole: FaultRole.costMonitor,
        rootCauseCode: ' ',
        at: reportedAt.add(const Duration(minutes: 6)),
      ),
      throwsArgumentError,
    );
  });

  test('rejects timestamps before the current stage and non-UTC timestamps', () {
    final assigned = openFault().assign(
      technician: technician(department: Department.electrical),
      at: reportedAt.add(const Duration(minutes: 1)),
    );

    expect(() => assigned.arrive(at: reportedAt), throwsArgumentError);
    expect(
      () => openFault().assign(
        technician: technician(department: Department.electrical),
        at: DateTime(2026, 11, 9, 8, 1),
      ),
      throwsArgumentError,
    );
  });
}
