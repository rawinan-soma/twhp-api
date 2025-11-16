import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { parse } from 'csv-parse/sync';

const prisma = new PrismaClient();
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

    await tx.accounts.create({
      data: {
        username: 'doed01',
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
  });
}

seed()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
