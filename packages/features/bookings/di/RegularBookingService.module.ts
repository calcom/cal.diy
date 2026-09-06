import { moduleLoader as bookingEventHandlerModuleLoader } from "@calcom/features/bookings/di/BookingEventHandlerService.module";
import { moduleLoader as bookingSeatRepositoryModuleLoader } from "@calcom/features/bookings/di/BookingSeatRepository.module";
import { RegularBookingService } from "@calcom/features/bookings/lib/service/RegularBookingService";
import { moduleLoader as credentialRepositoryModuleLoader } from "@calcom/features/credentials/di/CredentialRepository.module";
import { bindModuleToClassOnToken, createModule, type ModuleLoader } from "@calcom/features/di/di";
import { moduleLoader as bookingRepositoryModuleLoader } from "@calcom/features/di/modules/Booking";
import { moduleLoader as checkBookingAndDurationLimitsModuleLoader } from "@calcom/features/di/modules/CheckBookingAndDurationLimits";
import { moduleLoader as luckyUserServiceModuleLoader } from "@calcom/features/di/modules/LuckyUser";
import { moduleLoader as userRepositoryModuleLoader } from "@calcom/features/di/modules/User";
import { DI_TOKENS } from "@calcom/features/di/tokens";
import { moduleLoader as webhookProducerModuleLoader } from "@calcom/features/di/webhooks/modules/WebhookProducerService.module";
import { moduleLoader as hashedLinkServiceModuleLoader } from "@calcom/features/hashedLink/di/HashedLinkService.module";
import { moduleLoader as profileRepositoryModuleLoader } from "@calcom/features/users/di/Profile.module";
import { moduleLoader as bookingEmailAndSmsTaskerModuleLoader } from "./tasker/BookingEmailAndSmsTasker.module";

const thisModule = createModule();
const token = DI_TOKENS.REGULAR_BOOKING_SERVICE;
const moduleToken = DI_TOKENS.REGULAR_BOOKING_SERVICE_MODULE;
const loadModule = bindModuleToClassOnToken({
  module: thisModule,
  moduleToken,
  token,
  classs: RegularBookingService,
  depsMap: {
    checkBookingAndDurationLimitsService: checkBookingAndDurationLimitsModuleLoader,
    bookingRepository: bookingRepositoryModuleLoader,
    bookingSeatRepository: bookingSeatRepositoryModuleLoader,
    profileRepository: profileRepositoryModuleLoader,
    credentialRepository: credentialRepositoryModuleLoader,
    luckyUserService: luckyUserServiceModuleLoader,
    userRepository: userRepositoryModuleLoader,
    hashedLinkService: hashedLinkServiceModuleLoader,
    bookingEmailAndSmsTasker: bookingEmailAndSmsTaskerModuleLoader,
    bookingEventHandler: bookingEventHandlerModuleLoader,
    webhookProducer: webhookProducerModuleLoader,
  },
});

export const moduleLoader = {
  token,
  loadModule,
} satisfies ModuleLoader;

export type { RegularBookingService };
