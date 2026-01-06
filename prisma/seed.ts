/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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

    const provincialOfficer = JSON.parse(
      fs.readFileSync('./prisma/seed_data/admin_province.json', 'utf8'),
    );
    for (const item of provincialOfficer) {
      await tx.accounts.create({
        data: {
          username: item.username,
          password: item.password,
          email: item.email,
          role: 'Provincial',
          provincial: {
            create: {
              first_name: item.provincial.first_name,
              last_name: item.provincial.last_name,
              phone_number: item.provincial.phone_number,
              province_id: item.provincial.province_id,
            },
          },
        },
      });
    }

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
  });
}

seed()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
