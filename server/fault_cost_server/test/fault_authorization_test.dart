import 'package:fault_cost_server/fault_cost_server.dart';
import 'package:test/test.dart';

void main() {
  test('enforces separation of duties and hides financials from technicians', () {
    expect(
      FaultAuthorization.can(role: FaultRole.technician, action: FaultAction.close),
      isFalse,
    );
    expect(
      FaultAuthorization.can(role: FaultRole.costMonitor, action: FaultAction.close),
      isTrue,
    );
    expect(
      FaultAuthorization.can(role: FaultRole.administrator, action: FaultAction.close),
      isFalse,
    );
    expect(
      FaultAuthorization.can(role: FaultRole.technician, action: FaultAction.viewFinancials),
      isFalse,
    );
  });

  test('limits technician updates to their assigned department and fault', () {
    expect(
      FaultAuthorization.can(
        role: FaultRole.technician,
        action: FaultAction.updateAssignedFault,
        actorId: 'tech-1',
        assignedTechnicianId: 'tech-1',
        actorDepartment: Department.electrical,
        faultDepartment: Department.electrical,
      ),
      isTrue,
    );
    expect(
      FaultAuthorization.can(
        role: FaultRole.technician,
        action: FaultAction.updateAssignedFault,
        actorId: 'tech-2',
        assignedTechnicianId: 'tech-1',
        actorDepartment: Department.electrical,
        faultDepartment: Department.electrical,
      ),
      isFalse,
    );
    expect(
      FaultAuthorization.can(
        role: FaultRole.technician,
        action: FaultAction.updateAssignedFault,
        actorId: 'tech-1',
        assignedTechnicianId: 'tech-1',
        actorDepartment: Department.loading,
        faultDepartment: Department.electrical,
      ),
      isFalse,
    );
  });
}
