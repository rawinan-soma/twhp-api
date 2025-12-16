import fs from 'fs';
import { PrismaClient } from './generated/client';
import { parse } from 'csv-parse/sync';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});
async function seed() {
  const existingData = await prisma.provinces.count();

  if (existingData > 0) {
    console.log('Already exists!');
    return;
  }

  return prisma.$transaction(async (tx) => {
    const provinceFile = fs.readFileSync(
      './prisma/seed_data/provinces.csv',
      'utf8',
    );
    const provinceRecords = parse(provinceFile, {
      columns: true,
      skip_empty_lines: true,
    });
    const provinces = provinceRecords.map((r: any) => ({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      province_id: Number(r.province_id),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      name_th: r.name_th,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      health_region: Number(r.health_region),
    }));

    await tx.provinces.createMany({ data: provinces });
    console.log('Provinces seeded');

    const districtFile = fs.readFileSync(
      './prisma/seed_data/districts.csv',
      'utf8',
    );
    const districtRecords = parse(districtFile, {
      columns: true,
      skip_empty_lines: true,
    });
    const districts = districtRecords.map((r: any) => ({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      district_id: Number(r.district_id),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      name_th: r.name_th,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      province_id: Number(r.province_id),
    }));

    await tx.districts.createMany({ data: districts });
    console.log('Districts seeded');

    const subdistrictFile = fs.readFileSync(
      './prisma/seed_data/sub_districts.csv',
      'utf8',
    );
    const subdistrictRecords = parse(subdistrictFile, {
      columns: true,
      skip_empty_lines: true,
    });
    const subdistricts = subdistrictRecords.map((r: any) => ({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      subdistrict_id: Number(r.subdistrict_id),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      name_th: r.name_th,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      district_id: Number(r.district_id),
    }));

    await tx.subdistricts.createMany({ data: subdistricts });
    console.log('Subdistricts seeded');

    await tx.accounts.create({
      data: {
        username: 'admin',
        password:
          '$2a$12$RC/Pirt5C81LY/xHacGTDO4d7v2RPx18CEypubSjRDPbeP7GeUXBa',
        email: 'doed01@mail.com',
        role: 'DOED',
        adminDoed: {
          create: {
            first_name: 'Doed',
            last_name: 'Doed',
            phone_number: '12345678',
          },
        },
      },
    });
    await tx.accounts.create({
      data: {
        username: 'evalodpc6',
        password:
          '$2a$12$RC/Pirt5C81LY/xHacGTDO4d7v2RPx18CEypubSjRDPbeP7GeUXBa',
        email: 'evalodpc6@mail.com',
        role: 'Evaluator',
        evaluator: {
          create: {
            first_name: 'evalodpc6',
            last_name: 'evalodpc6',
            phone_number: '12345678',
            level: 'ODPC',
            region: 6,
          },
        },
      },
    });
    await tx.accounts.create({
      data: {
        username: 'evaldoh6',
        password:
          '$2a$12$RC/Pirt5C81LY/xHacGTDO4d7v2RPx18CEypubSjRDPbeP7GeUXBa',
        email: 'evaldoh6@mail.com',
        role: 'Evaluator',
        evaluator: {
          create: {
            first_name: 'evaldoh6',
            last_name: 'evaldoh6',
            phone_number: '12345678',
            level: 'DOH',
            region: 6,
          },
        },
      },
    });
    await tx.accounts.create({
      data: {
        username: 'evalmental6',
        password:
          '$2a$12$RC/Pirt5C81LY/xHacGTDO4d7v2RPx18CEypubSjRDPbeP7GeUXBa',
        email: 'evalmental6@mail.com',
        role: 'Evaluator',
        evaluator: {
          create: {
            first_name: 'evalmental6',
            last_name: 'evalmental6',
            phone_number: '12345678',
            level: 'Mental',
            region: 6,
          },
        },
      },
    });
    await tx.accounts.create({
      data: {
        username: 'province25',
        password:
          '$2a$12$RC/Pirt5C81LY/xHacGTDO4d7v2RPx18CEypubSjRDPbeP7GeUXBa',
        email: 'province25@mail.com',
        role: 'Provicial',
        provicial: {
          create: {
            first_name: 'province25',
            last_name: 'province25',
            phone_number: '12345678',
            province_id: 25,
          },
        },
      },
    });
    await tx.accounts.create({
      data: {
        username: 'factory1',
        password:
          '$2a$12$RC/Pirt5C81LY/xHacGTDO4d7v2RPx18CEypubSjRDPbeP7GeUXBa',
        email: 'factory1@mail.com',
        role: 'Factory',
        factory: {
          create: {
            factory_type: 1,
            name_th: 'โรงงานลำไย',
            name_en: 'Factory Lamai',
            tsic_code: '889900',
            address_no: '123/456',
            road: 'ถนนลำไย',
            soi: 'ซอยลำไย 8',
            zipcode: '25000',
            phone_number: '099999999',
            fax_number: '099999998',
            province_id: 25,
            district_id: 2501,
            subdistrict_id: 250101,
          },
        },
      },
    });
  });
}

seed()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
