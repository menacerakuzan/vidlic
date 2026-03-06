/*
 Seed core users and departments only (no demo reports/tasks).
 Run: node scripts/seed.js
*/
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function upsertDepartment({ code, name, nameUk }) {
  const existing = await prisma.department.findFirst({ where: { code } });
  if (existing) return existing;
  return prisma.department.create({ data: { code, name, nameUk } });
}

async function upsertPosition({ title, titleUk, departmentId }) {
  const existing = await prisma.position.findFirst({ where: { title, departmentId } });
  if (existing) return existing;
  return prisma.position.create({ data: { title, titleUk, departmentId } });
}

async function upsertUser({ email, employeeId, firstName, lastName, patronymic, role, departmentId, positionId, password }) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.create({
    data: {
      email,
      employeeId,
      firstName,
      lastName,
      patronymic,
      role,
      departmentId,
      positionId,
      passwordHash,
    },
  });
}

async function ensureAdmin(departmentId) {
  return upsertUser({
    email: 'admin@vidlik.gov.ua',
    employeeId: 'ADM001',
    firstName: 'Адмін',
    lastName: 'Системи',
    role: 'admin',
    departmentId,
    password: 'SecurePass123!',
  });
}

async function main() {
  await prisma.$connect();
  try {
    const itDepartment = await upsertDepartment({
      code: 'IT',
      name: 'IT Department',
      nameUk: 'Департамент інформаційних технологій',
    });

    const directorPosition = await upsertPosition({ title: 'Director', titleUk: 'Директор', departmentId: itDepartment.id });
    const managerPosition = await upsertPosition({ title: 'Manager', titleUk: 'Керівник', departmentId: itDepartment.id });
    const specialistPosition = await upsertPosition({ title: 'Specialist', titleUk: 'Спеціаліст', departmentId: itDepartment.id });

    const admin = await ensureAdmin(itDepartment.id);

    const director = await upsertUser({
      email: 'director@vidlik.gov.ua',
      employeeId: 'DIR001',
      firstName: 'Олександр',
      lastName: 'Директор',
      role: 'director',
      departmentId: itDepartment.id,
      positionId: directorPosition.id,
      password: 'DirectorPass123!',
    });

    const manager = await upsertUser({
      email: 'manager@vidlik.gov.ua',
      employeeId: 'MNG001',
      firstName: 'Наталія',
      lastName: 'Менеджер',
      role: 'manager',
      departmentId: itDepartment.id,
      positionId: managerPosition.id,
      password: 'ManagerPass123!',
    });

    const specialist = await upsertUser({
      email: 'specialist@vidlik.gov.ua',
      employeeId: 'SPC001',
      firstName: 'Ірина',
      lastName: 'Спеціаліст',
      role: 'specialist',
      departmentId: itDepartment.id,
      positionId: specialistPosition.id,
      password: 'SpecialistPass123!',
    });

    await prisma.department.update({
      where: { id: itDepartment.id },
      data: {
        managerId: manager.id,
        directorId: director.id,
      },
    });

    console.log('Seed complete. Users:', {
      admin: admin.email,
      director: director.email,
      manager: manager.email,
      specialist: specialist.email,
    });
  } catch (e) {
    console.error('Seed failed:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
