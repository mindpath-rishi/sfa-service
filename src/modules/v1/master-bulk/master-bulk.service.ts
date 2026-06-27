import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CountryService } from '../country/country.service';
import { ProvinceService } from '../province/province.service';
import { DesignationService } from '../designation/designation.service';
import { CustomerCategoryService } from '../customer-category/customer-category.service';
import { ChannelService } from '../channel/channel.service';
import { OutletTypeService } from '../outlet-type/outlet-type.service';
import { MarketService } from '../market/market.service';
import { ProductCategoryService } from '../product-category/product-category.service';
import { CreateCountryDto } from '../country/dto/create-country.dto';
import { CreateProvinceDto } from '../province/dto/create-province.dto';
import { CreateDesignationDto } from '../designation/dto/create-designation.dto';
import { CreateCustomerCategoryDto } from '../customer-category/dto/create-customer-category.dto';
import { CreateChannelDto } from '../channel/dto/create-channel.dto';
import { CreateOutletTypeDto } from '../outlet-type/dto/create-outlet-type.dto';
import { CreateMarketDto } from '../market/dto/create-market.dto';
import { ProductCategoryCreateDto } from '../product-category/dto/create-product-category.dto';
import * as XLSX from 'xlsx';
import { ProductCategoryType } from 'src/core/database/mongo/schema/product-category';
import * as ExcelJS from 'exceljs';

@Injectable()
export class MasterBulkService {
  constructor(private country: CountryService, private province: ProvinceService, private designation: DesignationService, private customerCategory: CustomerCategoryService, private channel: ChannelService, private outletType: OutletTypeService, private market: MarketService, private productCategory: ProductCategoryService) {}

  async upload(entity: string, items: Record<string, unknown>[]) {
    const configs: Record<string, { dto: new () => object; create: (value: any) => Promise<any> }> = {
      country: { dto: CreateCountryDto, create: (v) => this.country.create(v) },
      province: { dto: CreateProvinceDto, create: (v) => this.province.create(v) },
      designation: { dto: CreateDesignationDto, create: (v) => this.designation.create(v) },
      'customer-category': { dto: CreateCustomerCategoryDto, create: (v) => this.customerCategory.create(v) },
      channel: { dto: CreateChannelDto, create: (v) => this.channel.create(v) },
      'outlet-type': { dto: CreateOutletTypeDto, create: (v) => this.outletType.create(v) },
      market: { dto: CreateMarketDto, create: (v) => this.market.create(v) },
      'product-category': { dto: ProductCategoryCreateDto, create: (v) => this.productCategory.create(v) },
    };
    const config = configs[entity];
    if (!config) throw new BadRequestException('Unsupported master entity.');
    const results: any[] = [];
    let created = 0;
    for (const [index, item] of items.entries()) {
      try {
        const resolved = await this.resolveReferences(entity, item);
        const dto = plainToInstance(config.dto, { ...resolved, status: 'ACTIVE' });
        const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
        if (errors.length) throw new BadRequestException(errors.flatMap((e) => Object.values(e.constraints ?? {})).join(', '));
        const response = await config.create(dto);
        created++;
        results.push({ row: index + 1, status: 'CREATED', id: response?.data?.categoryId });
      } catch (error: any) {
        results.push({ row: index + 1, status: 'FAILED', message: error?.response?.message || error?.message || 'Unable to create row' });
      }
    }
    return { statusCode: 200, message: 'Master bulk upload processed', data: { total: items.length, created, failed: items.length - created, results } };
  }

  private async exactId(service: any, value: unknown, idKey: string) {
    if (!value) return value;
    const normalizedValue = String(value).trim();
    const searchText = normalizedValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const response = await service.findAll({ page: 1, limit: 100, searchText });
    const rows = response?.data ?? [];
    const match = rows.find((row: any) =>
      String(row[idKey] ?? '').trim().toLowerCase() === normalizedValue.toLowerCase() ||
      String(row.name ?? '').trim().toLowerCase() === normalizedValue.toLowerCase(),
    );
    if (!match) throw new BadRequestException(`Reference not found: ${value}`);
    return match[idKey];
  }

  private async resolveReferences(entity: string, item: Record<string, unknown>) {
    const value = { ...item };
    if (['province', 'designation'].includes(entity)) value.countryId = await this.exactId(this.country, value.countryId ?? value.country, 'countryId');
    if (entity === 'market') value.provinceId = await this.exactId(this.province, value.provinceId ?? value.province, 'provinceId');
    if (entity === 'designation') {
      value.provinceId = await this.exactId(this.province, value.provinceId ?? value.province, 'provinceId');
      value.marketId = await this.exactId(this.market, value.marketId ?? value.market, 'marketId');
    }
    if (entity === 'product-category' && String(value.type).toUpperCase() === 'CHILD') {
      value.parentId = await this.exactId(this.productCategory, value.parentId ?? value.parentCategory, 'categoryId');
    }
    delete value.country; delete value.province; delete value.market; delete value.parentCategory;
    return value;
  }

  private config(entity: string) {
    const configs: Record<string, { service: any; id: string; refs?: string[] }> = {
      country: { service: this.country, id: 'countryId' }, province: { service: this.province, id: 'provinceId' },
      designation: { service: this.designation, id: 'designationId' }, 'customer-category': { service: this.customerCategory, id: 'customerCategoryId' },
      channel: { service: this.channel, id: 'channelId' }, 'outlet-type': { service: this.outletType, id: 'outletTypeId' },
      market: { service: this.market, id: 'marketId' }, 'product-category': { service: this.productCategory, id: 'categoryId' },
    };
    const config = configs[entity];
    if (!config) throw new BadRequestException('Unsupported master entity.');
    return config;
  }

  async export(entity: string, fileType: 'xlsx' | 'csv' | 'pdf', type?: string) {
    const config = this.config(entity);
    const response = await config.service.findAll({ page: 1, limit: 10000, ...(type ? { type } : {}) });
    const rows = response.data ?? [];
    const [countries, provinces, markets, categories] = await Promise.all([
      this.country.findAll({ page: 1, limit: 10000 }), this.province.findAll({ page: 1, limit: 10000 }),
      this.market.findAll({ page: 1, limit: 10000 }), this.productCategory.findAll({ page: 1, limit: 10000 }),
    ]);
    const names = (items: any[], id: string) => new Map(items.map((row) => [row[id], row.name]));
    const countryNames = names(countries.data ?? [], 'countryId');
    const provinceNames = names(provinces.data ?? [], 'provinceId');
    const marketNames = names(markets.data ?? [], 'marketId');
    const categoryNames = names(categories.data ?? [], 'categoryId');
    const relationHeaders = entity === 'province' ? ['country'] : entity === 'market' ? ['province'] : entity === 'designation' ? ['country', 'province', 'market'] : entity === 'product-category' ? ['type', 'parentCategory'] : [];
    const headers = [config.id, 'name', ...relationHeaders, 'status'];
    const values = rows.map((row: any) => [row[config.id], row.name,
      ...(entity === 'province' ? [countryNames.get(row.countryId) || row.countryId] : []),
      ...(entity === 'market' ? [provinceNames.get(row.provinceId) || row.provinceId] : []),
      ...(entity === 'designation' ? [countryNames.get(row.countryId) || row.countryId, provinceNames.get(row.provinceId) || row.provinceId, marketNames.get(row.marketId) || row.marketId] : []),
      ...(entity === 'product-category' ? [row.type, categoryNames.get(row.parentId) || row.parentId || ''] : []), row.status]);
    const data = [headers, ...values];
    if (fileType === 'csv') return { buffer: Buffer.from(data.map((r: any[]) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')), fileName: `${entity}.csv`, mimeType: 'text/csv' };
    if (fileType === 'pdf') {
      const text = data.map((r: any[]) => r.join(' | ')).join('\n').replace(/[()\\]/g, ' ');
      const stream = `BT /F1 8 Tf 28 560 Td (${text.slice(0, 5000).replace(/\n/g, ') Tj 0 -14 Td (')}) Tj ET`;
      const pdf = `%PDF-1.4\n1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>endobj\n4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n5 0 obj<< /Length ${Buffer.byteLength(stream)} >>stream\n${stream}\nendstream endobj\ntrailer<< /Root 1 0 R >>\n%%EOF`;
      return { buffer: Buffer.from(pdf), fileName: `${entity}.pdf`, mimeType: 'application/pdf' };
    }
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(data), 'Master');
    return { buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), fileName: `${entity}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }

  async template(entity: string, type?: string) {
    const refs = await Promise.all([this.country.findAll({ page: 1, limit: 10000 }), this.province.findAll({ page: 1, limit: 10000 }), this.market.findAll({ page: 1, limit: 10000 }), this.productCategory.findAll({ page: 1, limit: 10000, type: ProductCategoryType.PARENT })]);
    const lists = {
      country: (refs[0].data ?? []).map((r: any) => r.name), province: (refs[1].data ?? []).map((r: any) => r.name),
      market: (refs[2].data ?? []).map((r: any) => r.name), parentCategory: (refs[3].data ?? []).map((r: any) => r.name), type: ['PARENT', 'CHILD'],
    };
    const headers = [...(entity === 'product-category' ? ['categoryId'] : []), 'name', ...(entity === 'province' ? ['country'] : []), ...(entity === 'market' ? ['province'] : []), ...(entity === 'designation' ? ['country', 'province', 'market'] : []), ...(entity === 'product-category' ? ['type', ...(type === 'CHILD' ? ['parentCategory'] : [])] : [])];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Template');
    sheet.addRow(headers);
    sheet.addRow(headers.map((header) => header === 'categoryId' ? 'CAT-SAMPLE' : header === 'name' ? 'Sample Name' : (lists as any)[header]?.[0] ?? ''));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    headers.forEach((_, index) => { sheet.getColumn(index + 1).width = 24; });

    let referenceColumn = 26;
    headers.forEach((header, index) => {
      const values = (lists as any)[header] as string[] | undefined;
      if (!values?.length) return;
      const column = sheet.getColumn(referenceColumn);
      column.hidden = true;
      sheet.getCell(1, referenceColumn).value = `${header} options`;
      values.forEach((value, valueIndex) => { sheet.getCell(valueIndex + 2, referenceColumn).value = value; });
      const letter = column.letter;
      for (let row = 2; row <= 1001; row += 1) {
        sheet.getCell(row, index + 1).dataValidation = {
          type: 'list',
          allowBlank: false,
          formulae: [`'Template'!$${letter}$2:$${letter}$${values.length + 1}`],
          showErrorMessage: true,
          errorTitle: 'Invalid selection',
          error: `Select a value from the ${header} dropdown.`,
        };
      }
      referenceColumn += 1;
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return { buffer, fileName: `${entity}-${type?.toLowerCase() || 'bulk'}-template.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  }
}
