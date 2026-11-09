import '../domain/fault_case.dart';

enum FaultAction {
  open,
  assign,
  updateAssignedFault,
  requestPart,
  issuePart,
  close,
  overridePriority,
  manageAssets,
  viewFinancials,
  viewAssignedWork,
}

class FaultAuthorization {
  const FaultAuthorization._();

  static bool can({
    required FaultRole role,
    required FaultAction action,
    String? actorId,
    String? assignedTechnicianId,
    Department? actorDepartment,
    Department? faultDepartment,
  }) {
    return switch (action) {
      FaultAction.open =>
        role == FaultRole.costMonitor || role == FaultRole.maintenanceManager || role == FaultRole.administrator,
      FaultAction.assign || FaultAction.overridePriority =>
        role == FaultRole.maintenanceManager || role == FaultRole.administrator,
      FaultAction.updateAssignedFault || FaultAction.requestPart =>
        role == FaultRole.technician &&
            actorId != null &&
            actorId == assignedTechnicianId &&
            actorDepartment != null &&
            actorDepartment == faultDepartment,
      FaultAction.issuePart => role == FaultRole.warehouse || role == FaultRole.administrator,
      FaultAction.close => role == FaultRole.costMonitor,
      FaultAction.manageAssets => role == FaultRole.administrator,
      FaultAction.viewFinancials =>
        role == FaultRole.costMonitor ||
            role == FaultRole.maintenanceManager ||
            role == FaultRole.productionManager ||
            role == FaultRole.administrator,
      FaultAction.viewAssignedWork =>
        role == FaultRole.technician &&
            actorId != null &&
            actorId == assignedTechnicianId &&
            actorDepartment != null &&
            actorDepartment == faultDepartment,
    };
  }

  static void require({
    required FaultRole role,
    required FaultAction action,
    String? actorId,
    String? assignedTechnicianId,
    Department? actorDepartment,
    Department? faultDepartment,
  }) {
    if (!can(
      role: role,
      action: action,
      actorId: actorId,
      assignedTechnicianId: assignedTechnicianId,
      actorDepartment: actorDepartment,
      faultDepartment: faultDepartment,
    )) {
      throw StateError('Role $role is not authorized to perform $action.');
    }
  }
}
