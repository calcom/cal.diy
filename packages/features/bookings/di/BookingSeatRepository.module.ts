import { BookingSeatRepository } from "@calcom/features/bookings/repositories/BookingSeatRepository";
import { bindModuleToClassOnToken, createModule, type ModuleLoader } from "@calcom/features/di/di";
import { moduleLoader as prismaModuleLoader } from "@calcom/features/di/modules/Prisma";
import { DI_TOKENS } from "@calcom/features/di/tokens";

const thisModule = createModule();
const token = DI_TOKENS.BOOKING_SEAT_REPOSITORY;
const moduleToken = DI_TOKENS.BOOKING_SEAT_REPOSITORY_MODULE;
const loadModule = bindModuleToClassOnToken({
  module: thisModule,
  moduleToken,
  token,
  classs: BookingSeatRepository,
  dep: prismaModuleLoader,
});

export const moduleLoader = { token, loadModule } satisfies ModuleLoader;
