/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { App } from 'supertest/types';
import { PrismaService } from 'prisma/prisma.service';
import { AdminsModule } from './admins.module';
import request from 'supertest';
import { AuthenticationModule } from 'src/authentication/authentication.module';
import cookieParser from 'cookie-parser';
import TestAgent from 'supertest/lib/agent';
import * as bcrypt from 'bcrypt';

describe('Admins', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let agent: TestAgent;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AdminsModule, AuthenticationModule],
    }).compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = module.get<PrismaService>(PrismaService);

    agent = request.agent(app.getHttpServer());

    await prisma.accounts.deleteMany();
    await prisma.factories.deleteMany();
    await prisma.enrolls.deleteMany();
    await prisma.accounts.create({
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
    await prisma.accounts.create({
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

    await prisma.accounts.create({
      data: {
        username: 'doh6',
        password: await bcrypt.hash('12345', 12),
        email: 'doh6@mail.com',
        role: 'Evaluator',
        evaluator: {
          create: {
            first_name: 'ศูนย์อนามัย6',
            last_name: 'ศูนย์อนามัย6',
            phone_number: '0900000000',
            level: 'DOH',
            region: 6,
          },
        },
      },
    });

    await prisma.accounts.create({
      data: {
        username: 'odpc6',
        password: await bcrypt.hash('12345', 12),
        email: 'odpc6@mail.com',
        role: 'Evaluator',
        evaluator: {
          create: {
            first_name: 'สคร6',
            last_name: 'สคร6',
            phone_number: '0900000000',
            level: 'ODPC',
            region: 6,
          },
        },
      },
    });

    await prisma.accounts.create({
      data: {
        username: 'mental6',
        password: await bcrypt.hash('12345', 12),
        email: 'mental6@mail.com',
        role: 'Evaluator',
        evaluator: {
          create: {
            first_name: 'ศูนย์จิต6',
            last_name: 'ศูนย์จิต6',
            phone_number: '0900000000',
            level: 'Mental',
            region: 6,
          },
        },
      },
    });

    const factoryId = (await prisma.accounts.findFirst({
      where: { factory: { name_th: 'โรงงานลำไย' } },
    }))!.id;

    const location = await prisma.factories.findFirst({
      where: { account_id: factoryId },
      include: { province: true },
    });

    const evals = await prisma.evaluators.findMany({
      where: { region: location?.province.health_region },
    });

    const eval_doh = evals.filter((e) => e.level === 'DOH')[0];
    const eval_mental = evals.filter((e) => e.level === 'Mental')[0];
    const eval_odpc = evals.filter((e) => e.level === 'ODPC')[0];

    await prisma.enrolls.create({
      data: {
        factory: { connect: { account_id: factoryId } },
        eval_doh: { connect: { account_id: eval_doh.account_id } },
        eval_mental: { connect: { account_id: eval_mental.account_id } },
        eval_odpc: { connect: { account_id: eval_odpc.account_id } },
        employee_th_m: 25,
        employee_mm_m: 10,
        employee_kh_m: 5,
        employee_la_m: 3,
        employee_vn_m: 8,
        employee_cn_m: 2,
        employee_ph_m: 4,
        employee_jp_m: 1,
        employee_in_m: 6,
        employee_other_m: 2,
        employee_th_f: 30,
        employee_mm_f: 12,
        employee_kh_f: 7,
        employee_la_f: 4,
        employee_vn_f: 9,
        employee_cn_f: 3,
        employee_ph_f: 5,
        employee_jp_f: 2,
        employee_in_f: 8,
        employee_other_f: 3,
        standard_HC: true,
        standard_SAN: true,
        standard_wellness: false,
        standard_safety: true,
        standard_TIS18001: false,
        standard_ISO45001: true,
        standard_ISO14001: true,
        standard_zero: false,
        standard_5S: true,
        standard_HAS: false,
        safety_officer_prefix: 'นาย',
        safety_officer_first_name: 'สมชาย',
        safety_officer_last_name: 'ใจดี',
        safety_officer_position: 'เจ้าหน้าที่ความปลอดภัย',
        safety_officer_email: 'somchai.jaidee@company.com',
        safety_officer_phone: '0812345678',
        safety_officer_lineID: 'somchai_safety',
      },
    });

    await agent
      .post('/authentication/login')
      .send({ username: 'doed01', password: '12345' })
      .expect(200);
  });

  afterEach(async () => {
    await prisma.accounts.deleteMany();
    await prisma.factories.deleteMany();
    // await agent.post('/authentication/logout').expect(200);
  });

  it('should update own data', async () => {
    await agent
      .patch(`/admins`)
      .send({
        first_name: 'กองโรค',
        last_name: 'กองโรค',
        phone_number: '0987654321',
        email: 'doed_examplemail@mail.go.th',
      })
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          first_name: 'กองโรค',
          last_name: 'กองโรค',
          phone_number: '0987654321',
          email: 'doed_examplemail@mail.go.th',
        });
      });

    expect(
      await prisma.adminsDoed.findFirst({
        where: { account: { username: 'doed01' } },
      }),
    ).toMatchObject({
      first_name: 'กองโรค',
      last_name: 'กองโรค',
    });
    expect(
      await prisma.accounts.findUnique({
        where: { username: 'doed01' },
      }),
    ).toMatchObject({
      email: 'doed_examplemail@mail.go.th',
    });
  });

  it('should validate registered factory', async () => {
    const factory = await prisma.accounts.findFirst({
      where: { username: 'factory1' },
    });

    await agent
      .patch(`/admins/factory/validate/${factory!.id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          factory_id: factory!.id,
          is_validate: true,
        });
      });

    expect(
      await prisma.factories.findUnique({ where: { account_id: factory!.id } }),
    ).toHaveProperty('is_validate', true);
  });

  it('should delete unwanted factory', async () => {
    const factory = await prisma.accounts.findFirst({
      where: {
        username: 'factory1',
      },
    });

    await agent
      .delete(`/admins/factory/${factory!.id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          message: 'factory deleted successfully',
        });
      });

    await agent
      .get(`/admins/factory?factory_id=${factory!.id}`)
      .expect(400)
      .expect((res) => {
        expect(res.body).toHaveProperty('message', 'factory not found');
      });

    expect(
      await prisma.factories.findUnique({ where: { account_id: factory!.id } }),
    ).toBeNull();
  });

  it('should retrun array of all un-validated factories', async () => {
    await agent
      .get('/admins/factories?validated=false')
      .expect(200)
      .expect((res) => {
        expect(res.body).toBeInstanceOf(Array);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0]).toHaveProperty('account_id');
        expect(res.body[0]).toHaveProperty('name_th');
        expect(res.body[0]).toHaveProperty('province_id');
        expect(res.body[0]).toHaveProperty('is_validate', false);
      });
  });

  it('should return array of all validated factories', async () => {
    const factory = await prisma.accounts.findFirst({
      where: { username: 'factory1' },
    });

    await agent
      .patch(`/admins/factory/validate/${factory!.id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toMatchObject({
          factory_id: factory!.id,
          is_validate: true,
        });
      });

    await agent
      .get('/admins/factories?validated=true')
      .expect(200)
      .expect((res) => {
        expect(res.body).toBeInstanceOf(Array);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0]).toHaveProperty('account_id');
        expect(res.body[0]).toHaveProperty('name_th');
        expect(res.body[0]).toHaveProperty('province_id');
        expect(res.body[0]).toHaveProperty('is_validate', true);
      });
  });

  it('should get one factory by id', async () => {
    const factory = await prisma.accounts.findFirst({
      where: { username: 'factory1' },
    });

    await agent
      .get(`/admins/factory?factory_id=${factory?.id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toBeInstanceOf(Object);
        expect(res.body).toHaveProperty('name_th');
        expect(res.body).toHaveProperty('username');
        expect(res.body).not.toHaveProperty('account');
      });
  });

  it('should not access if current user is not DOED', async () => {
    await agent.post('/authentication/logout').expect(200);

    await agent
      .post('/authentication/login')
      .send({ username: 'factory1', password: '12345' });

    const factory = await prisma.accounts.findFirst({
      where: { username: 'factory1' },
    });

    await agent.get(`/admins/factory?factory_id=${factory?.id}`).expect(403);
  });

  it('should update password and use new password to login', async () => {
    await agent
      .patch(`/admins`)
      .send({
        password: 'newPassword',
      })
      .expect(200);

    await agent
      .post('/authentication/login')
      .send({ username: 'doed01', password: 'newPassword' })
      .expect(200);

    await agent
      .get('/authentication')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('id');
        expect(res.body).toHaveProperty('username', 'doed01');
      });

    await agent.post('/authentication/logout').expect(200);
  });

  it('should edit factory data by account id', async () => {
    const factory = await prisma.accounts.findFirst({
      where: { username: 'factory1' },
    });

    await agent
      .patch(`/admins/factory/${factory?.id}`)
      .send({
        name_th: 'โรงงานเกลือ',
      })
      .expect(200);

    await agent
      .get(`/admins/factory?factory_id=${factory?.id}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toBeInstanceOf(Object);
        expect(res.body).toHaveProperty('name_th', 'โรงงานเกลือ');
        expect(res.body).toHaveProperty('username');
        expect(res.body).not.toHaveProperty('account');
      });
  });

  it('should get all enrolls data', async () => {});
});
