/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import fs from 'fs';
import { PrismaClient } from './generated/client';
import { parse } from 'csv-parse/sync';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    transactionOptions: {
      maxWait: 5000,
      timeout: 30000,
    },
  }),
});
async function seed() {
  await prisma.$transaction(async (tx) => {
    const provinceFile = fs.readFileSync(
      './prisma/seed_data/provinces.csv',
      'utf8',
    );
    const provinceRecords = parse(provinceFile, {
      columns: true,
      skip_empty_lines: true,
    });
    const provinces = provinceRecords.map((r: any) => ({
      province_id: Number(r.province_id),
      name_th: r.name_th,
      health_region: Number(r.health_region),
    }));

    await tx.provinces.createMany({ data: provinces, skipDuplicates: true });
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
      district_id: Number(r.district_id),
      name_th: r.name_th,
      province_id: Number(r.province_id),
    }));

    await tx.districts.createMany({ data: districts, skipDuplicates: true });
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
      subdistrict_id: Number(r.subdistrict_id),
      name_th: r.name_th,
      district_id: Number(r.district_id),
    }));

    await tx.subdistricts.createMany({
      data: subdistricts,
      skipDuplicates: true,
    });
    console.log('Subdistricts seeded');
  });

  const provincialOfficer = JSON.parse(
    fs.readFileSync('./prisma/seed_data/admin_province.json', 'utf8'),
  );

  console.log('Hashing passwords...');
  const hashedProvData = await Promise.all(
    provincialOfficer.map(async (item) => ({
      ...item,
      hashedPassword: await bcrypt.hash(item.password, 12),
    })),
  );

  await prisma.$transaction(async (tx) => {
    for (const item of hashedProvData) {
      try {
        await tx.accounts.upsert({
          where: { username: item.username },
          update: { password: item.hashedPassword },
          create: {
            username: item.username,
            password: item.hashedPassword,
            email: item.email,
            role: 'Provincial',
            provincial: {
              create: {
                first_name: item.provincial.first_name,
                last_name: item.provincial.last_name,
                phone_number: item.provincial.phone_number,
                province_id: Number(item.provincial.province_id),
              },
            },
          },
        });
      } catch (err) {
        console.error(item.username);
        throw err;
      }
    }

    console.log('Provincial Officers seeded');
  });

  const evaluators = JSON.parse(
    fs.readFileSync('./prisma/seed_data/eval.json', 'utf8'),
  );

  console.log('Hashing passwords...');
  const hashedEvData = await Promise.all(
    evaluators.map(async (item) => ({
      ...item,
      hashedPassword: await bcrypt.hash(item.password, 12),
    })),
  );

  await prisma.$transaction(async (tx) => {
    for (const item of hashedEvData) {
      try {
        await tx.accounts.upsert({
          where: { username: item.username },
          update: { password: item.hashedPassword },
          create: {
            username: item.username,
            password: item.password,
            email: item.email,
            role: 'Evaluator',
            evaluator: {
              create: {
                first_name: item.first_name,
                last_name: item.last_name,
                level: item.level,
                phone_number: item.phone_number,
                region: item.region,
              },
            },
          },
        });
      } catch (err) {
        console.error(item.username);
        throw err;
      }
    }

    console.log('Evaluator seeded');
  });
}

seed()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
