import * as ExcelJS from 'exceljs';
import { CreateEmployeeDto } from '../../employee/dto/create-employee.dto';
import { EmployeeService } from '../../employee/employee.service';
import type { ImportDefinition } from '../bulk-import.types';
import { addInstructions, requireHeaders, styleHeader, toBuffer } from '../sheet.utils';
import { outcomesFrom } from './outcomes';

const HEADERS = ['name', 'employeeType', 'manNumber', 'mobile', 'email', 'loginId', 'password'];
const REQUIRED = ['name', 'mobile', 'employeeType'];
const TYPES = ['STAFF', 'SUPPORTING_STAFF'];

/** Bulk employee creation (same rules as the former MIS upload). */
export const employeesDefinition = (employees: EmployeeService): ImportDefinition<Record<string, unknown>> => ({
  type: 'employees',
  label: 'Employees',
  description: 'Create employees. STAFF get a login; SUPPORTING_STAFF (drivers) do not.',
  requiredHeaders: REQUIRED,
  optionalHeaders: HEADERS.filter((header) => !REQUIRED.includes(header)),
  limit: 5000,
  batchSize: 100,
  itemDto: CreateEmployeeDto,

  async parse(sheet) {
    requireHeaders(sheet, REQUIRED);
    return sheet.rows.map((row) => {
      const errors: string[] = [];
      const name = row.get('name');
      const mobile = row.get('mobile');
      const typeText = row.get('employeeType').toUpperCase();
      if (!name) errors.push('name is required');
      if (!mobile) errors.push('mobile is required');
      if (!typeText) errors.push('employeeType is required');
      else if (!TYPES.includes(typeText)) errors.push('employeeType must be STAFF or SUPPORTING_STAFF');
      const password = row.get('password');
      if (typeText === 'STAFF' && !password) errors.push('password is required for STAFF');

      return {
        rows: [row.rowNumber],
        errors,
        payload: {
          name,
          manNumber: row.get('manNumber') || row.get('man') || undefined,
          mobile,
          email: row.get('email') || undefined,
          employeeType: typeText,
          loginId: typeText === 'STAFF' ? row.get('loginId') || undefined : undefined,
          password: typeText === 'STAFF' ? password : undefined,
          status: 'ACTIVE',
        },
      };
    });
  },

  async process(payloads) {
    const response = await employees.bulkUpload({ items: payloads } as any);
    return outcomesFrom(response, payloads.length, (result) => `Created employee ${result.employeeId ?? ''}`.trim());
  },

  async template() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Employees');
    sheet.addRow(HEADERS);
    sheet.addRow(['John Doe', 'STAFF', 'MAN-001', '9876543210', 'john@example.com', 'john.doe', 'Passw0rd@123']);
    sheet.addRow(['Driver Name', 'SUPPORTING_STAFF', 'MAN-002', '9876543211', '', '', '']);
    styleHeader(sheet, [26, 20, 14, 16, 28, 18, 18]);
    addInstructions(workbook, [
      'Required: name, mobile (8 to 15 digits), employeeType (STAFF or SUPPORTING_STAFF).',
      'password is required for STAFF; loginId is generated from the name when blank. Drivers (SUPPORTING_STAFF) get no login.',
      'Positions and roles are assigned afterwards from MIS → Employees or Reference Masters → Positions.',
      'The result file lists every row with its Status and Remark.',
    ]);
    return { buffer: await toBuffer(workbook), fileName: 'employee-bulk-upload-template.xlsx' };
  },
});
