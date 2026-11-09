import 'fault_case.dart';

class FaultQueue {
  const FaultQueue._();

  static Technician? bestAvailableTechnician({
    required Department department,
    required Iterable<Technician> technicians,
  }) {
    final matches = technicians.where(
      (technician) =>
          technician.department == department &&
          technician.isAvailable &&
          technician.isOnShift &&
          technician.id.trim().isNotEmpty &&
          technician.skillLevel >= 1 &&
          technician.skillLevel <= 5,
    ).toList()
      ..sort((a, b) {
        final bySkill = b.skillLevel.compareTo(a.skillLevel);
        return bySkill != 0 ? bySkill : a.id.compareTo(b.id);
      });
    return matches.isEmpty ? null : matches.first;
  }

  static FaultCase? nextFaultFor({
    required Technician technician,
    required Iterable<FaultCase> pendingFaults,
  }) {
    if (!technician.isAvailable || !technician.isOnShift) {
      return null;
    }
    final matches = pendingFaults
        .where(
          (fault) =>
              fault.status == FaultStatus.pendingWait &&
              fault.requiredDepartment == technician.department,
        )
        .toList()
      ..sort((a, b) {
        final byPriority = b.priorityScore.compareTo(a.priorityScore);
        if (byPriority != 0) return byPriority;
        final byAge = a.reportedAt.compareTo(b.reportedAt);
        return byAge != 0 ? byAge : a.id.compareTo(b.id);
      });
    return matches.isEmpty ? null : matches.first;
  }
}
