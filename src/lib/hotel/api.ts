import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { z } from "zod";

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error("HOTEL:validation");
  return out(result.data);
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function svc() {
  return import("./service.server");
}

function out(value: unknown): any {
  return value;
}

export const getPublicHotel = createServerFn({ method: "GET" }).handler(async () => {
  const { publicHotel } = await svc();
  return out(publicHotel());
});

export const searchRooms = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    parse(z.object({ checkIn: date, checkOut: date, guests: z.number().int().min(1).max(8) }), input),
  )
  .handler(async ({ data }) => {
    const { searchAvailability } = await svc();
    return out(searchAvailability(data));
  });

export const getSessionContext = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { sessionContext } = await svc();
    return out(sessionContext(context.userId));
  });

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parse(
      z.object({
        fullName: z.string().min(2).max(120),
        phone: z.string().max(24).nullable().optional(),
        nationality: z.string().max(80).nullable().optional(),
        dateOfBirth: z.string().nullable().optional(),
        idDocType: z.string().max(40).nullable().optional(),
        idDocLast4: z.string().max(4).nullable().optional(),
        locale: z.enum(["fa", "en"]).optional(),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { saveProfile: save } = await svc();
    return out(save(context.userId, data));
  });

export const claimHotelAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { claimAdmin } = await svc();
    return out(claimAdmin(context.userId));
  });

export const createReservation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parse(
      z.object({
        roomType: z.string().min(2).max(40),
        checkIn: date,
        checkOut: date,
        adults: z.number().int().min(1).max(8),
        children: z.number().int().min(0).max(8),
        guestName: z.string().min(2).max(120),
        guestPhone: z.string().max(24).nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
        idempotencyKey: z.string().min(8).max(80),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { createReservation: book } = await svc();
    return out(book(context.userId, data));
  });

export const listMyReservations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { myReservations } = await svc();
    return out(myReservations(context.userId));
  });

export const cancelMyReservation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ reservationId: z.number().int().positive() }), input))
  .handler(async ({ context, data }) => {
    const { cancelMyReservation: cancel } = await svc();
    return out(cancel(context.userId, data.reservationId));
  });

export const listServices = createServerFn({ method: "GET" }).handler(async () => {
  const { listServices: list } = await svc();
  return out(list());
});

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parse(
      z.object({
        serviceId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(20),
        notes: z.string().max(500).nullable().optional(),
        idempotencyKey: z.string().min(8).max(80),
        serviceDate: z.string().nullable().optional(),
        serviceTime: z.string().max(8).nullable().optional(),
        guestCount: z.number().int().min(1).max(8).nullable().optional(),
        plate: z.string().max(20).nullable().optional(),
        vehicleType: z.string().max(40).nullable().optional(),
        issueCode: z.string().max(40).nullable().optional(),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { placeOrder: place } = await svc();
    return out(place(context.userId, data));
  });

export const listMyOrders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { myOrders } = await svc();
    return out(myOrders(context.userId));
  });

export const cancelMyOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ orderId: z.number().int().positive() }), input))
  .handler(async ({ context, data }) => {
    const { cancelMyOrder: cancel } = await svc();
    return out(cancel(context.userId, data.orderId));
  });

export const getMyFolio = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { myFolio } = await svc();
    return out(myFolio(context.userId));
  });

export const requestExtension = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ requestedCheckOut: date }), input))
  .handler(async ({ context, data }) => {
    const { requestExtension: extend } = await svc();
    return out(extend(context.userId, data.requestedCheckOut));
  });

export const requestCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { requestCheckout: ask } = await svc();
    return out(ask(context.userId));
  });

export const cancelCheckoutRequest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { cancelCheckoutRequest: withdraw } = await svc();
    return out(withdraw(context.userId));
  });

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { myNotifications } = await svc();
    return out(myNotifications(context.userId));
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ ids: z.array(z.number().int().positive()).max(40) }), input))
  .handler(async ({ context, data }) => {
    const { markNotificationsRead: mark } = await svc();
    return out(mark(context.userId, data.ids));
  });

export const getRoomCard = createServerFn({ method: "POST" })
  .validator((input: unknown) => parse(z.object({ code: z.string().min(2).max(40) }), input))
  .handler(async ({ data }) => {
    const { roomCard } = await svc();
    return out(roomCard(data.code, null));
  });

export const getRoomCardForGuest = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ code: z.string().min(2).max(40) }), input))
  .handler(async ({ context, data }) => {
    const { roomCard } = await svc();
    return out(roomCard(data.code, context.userId));
  });

export const getPrintableQr = createServerFn({ method: "POST" })
  .validator((input: unknown) => parse(z.object({ code: z.string().min(2).max(40) }), input))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { qrSvg } = await svc();
    const origin = new URL(getRequest().url).origin;
    return out(qrSvg(data.code, origin));
  });

export const getOpsSnapshot = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { opsSnapshot } = await svc();
    return out(opsSnapshot(context.userId));
  });

export const getStaffReservations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { staffReservations } = await svc();
    return out(staffReservations(context.userId));
  });

export const confirmReservation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parse(z.object({ reservationId: z.number().int().positive(), nightlyRate: z.number().int().min(0) }), input),
  )
  .handler(async ({ context, data }) => {
    const { staffConfirm } = await svc();
    return out(staffConfirm(context.userId, data.reservationId, data.nightlyRate));
  });

export const checkInReservation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ reservationId: z.number().int().positive() }), input))
  .handler(async ({ context, data }) => {
    const { staffCheckIn } = await svc();
    return out(staffCheckIn(context.userId, data.reservationId));
  });

export const checkOutStay = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ stayId: z.number().int().positive() }), input))
  .handler(async ({ context, data }) => {
    const { staffCheckOut } = await svc();
    return out(staffCheckOut(context.userId, data.stayId));
  });

export const noShowReservation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ reservationId: z.number().int().positive() }), input))
  .handler(async ({ context, data }) => {
    const { staffNoShow } = await svc();
    return out(staffNoShow(context.userId, data.reservationId));
  });

export const staffCancelReservation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ reservationId: z.number().int().positive() }), input))
  .handler(async ({ context, data }) => {
    const { staffCancel } = await svc();
    return out(staffCancel(context.userId, data.reservationId));
  });

export const getStaffRooms = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { staffRooms } = await svc();
    return out(staffRooms(context.userId));
  });

export const updateRoom = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parse(
      z.object({
        roomId: z.number().int().positive(),
        status: z
          .enum([
            "AVAILABLE",
            "RESERVED",
            "OCCUPIED",
            "CHECKOUT_PENDING",
            "CLEANING",
            "MAINTENANCE",
            "OUT_OF_SERVICE",
            "BLOCKED",
          ])
          .optional(),
        roomType: z.string().max(40).optional(),
        capacity: z.number().int().min(1).max(8).optional(),
        descriptionEn: z.string().max(400).optional(),
        descriptionFa: z.string().max(400).optional(),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { staffUpdateRoom } = await svc();
    return out(staffUpdateRoom(context.userId, data));
  });

export const getStaffOrders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { staffOrders } = await svc();
    return out(staffOrders(context.userId));
  });

export const transitionOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parse(
      z.object({
        orderId: z.number().int().positive(),
        to: z.enum([
          "ACCEPTED",
          "PREPARING",
          "READY",
          "DELIVERING",
          "DELIVERED",
          "COMPLETED",
          "CANCELLED",
          "REJECTED",
        ]),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { staffTransition } = await svc();
    return out(staffTransition(context.userId, data.orderId, data.to));
  });

export const setOrderPrice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parse(z.object({ itemId: z.number().int().positive(), price: z.number().int().min(0) }), input),
  )
  .handler(async ({ context, data }) => {
    const { staffSetPrice } = await svc();
    return out(staffSetPrice(context.userId, data.itemId, data.price));
  });

export const recordPayment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parse(
      z.object({
        folioId: z.number().int().positive(),
        amount: z.number().int().positive(),
        method: z.enum(["CASH", "CARD", "TRANSFER", "GATEWAY"]),
        reference: z.string().max(80).optional(),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { staffPayment } = await svc();
    return out(staffPayment(context.userId, data));
  });

export const getStaffFolio = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ stayId: z.number().int().positive() }), input))
  .handler(async ({ context, data }) => {
    const { staffFolio } = await svc();
    return out(staffFolio(context.userId, data.stayId));
  });

export const postAdjustment = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parse(
      z.object({
        folioId: z.number().int().positive(),
        amount: z.number().int(),
        descriptionEn: z.string().min(2).max(160),
        descriptionFa: z.string().min(2).max(160),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { staffAdjust } = await svc();
    return out(staffAdjust(context.userId, data));
  });

export const getHousekeeping = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { staffHousekeeping } = await svc();
    return out(staffHousekeeping(context.userId));
  });

export const updateHousekeeping = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parse(
      z.object({
        taskId: z.number().int().positive(),
        status: z.enum(["ASSIGNED", "IN_PROGRESS", "DONE"]),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { staffHousekeepingUpdate } = await svc();
    return out(staffHousekeepingUpdate(context.userId, data.taskId, data.status));
  });

export const getExtensions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { staffExtensions } = await svc();
    return out(staffExtensions(context.userId));
  });

export const decideExtension = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parse(z.object({ requestId: z.number().int().positive(), approve: z.boolean() }), input),
  )
  .handler(async ({ context, data }) => {
    const { staffDecideExtension } = await svc();
    return out(staffDecideExtension(context.userId, data.requestId, data.approve));
  });

export const getParking = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { staffParking } = await svc();
    return out(staffParking(context.userId));
  });

export const updateParking = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parse(
      z.object({
        id: z.number().int().positive(),
        slot: z.string().max(40),
        status: z.string().max(20),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { staffParkingUpdate } = await svc();
    return out(staffParkingUpdate(context.userId, data.id, data.slot, data.status));
  });

export const getMaintenance = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { staffMaintenance } = await svc();
    return out(staffMaintenance(context.userId));
  });

export const getDirectory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { staffDirectory } = await svc();
    return out(staffDirectory(context.userId));
  });

export const assignRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    // The target is an account picked from the staff directory (by id), never a
    // free-typed e-mail: sign-up e-mails are unverified, so an impostor who
    // registered the manager's address first would otherwise receive the role.
    parse(z.object({ userId: z.string().min(1).max(80), role: z.string().min(3).max(40), grant: z.boolean() }), input),
  )
  .handler(async ({ context, data }) => {
    const { staffAssignRole } = await svc();
    return out(staffAssignRole(context.userId, data.userId, data.role, data.grant));
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parse(z.object({ userId: z.string().min(1).max(80), newPassword: z.string().min(8).max(128) }), input),
  )
  .handler(async ({ context, data }) => {
    const { staffResetPassword } = await svc();
    return out(staffResetPassword(context.userId, data.userId, data.newPassword));
  });

export const getAudit = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { staffAudit } = await svc();
    return out(staffAudit(context.userId));
  });

export const updateSetting = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ key: z.string().min(2).max(40), value: z.string().max(500) }), input))
  .handler(async ({ context, data }) => {
    const { staffUpdateSetting } = await svc();
    return out(staffUpdateSetting(context.userId, data.key, data.value));
  });

export const updateService = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) =>
    parse(
      z.object({
        id: z.number().int().positive(),
        price: z.number().int().min(0).nullable(),
        complimentary: z.boolean().optional(),
        active: z.boolean().optional(),
      }),
      input,
    ),
  )
  .handler(async ({ context, data }) => {
    const { staffUpdateService } = await svc();
    return out(staffUpdateService(context.userId, data));
  });

export const setMediaUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ id: z.number().int().positive(), url: z.string().max(500) }), input))
  .handler(async ({ context, data }) => {
    const { staffSetMedia } = await svc();
    return out(staffSetMedia(context.userId, data.id, data.url));
  });

export const publishAnnouncement = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parse(z.object({ en: z.string().max(400), fa: z.string().max(400) }), input))
  .handler(async ({ context, data }) => {
    const { staffAnnounce } = await svc();
    return out(staffAnnounce(context.userId, data.en, data.fa));
  });

export const getHealth = createServerFn({ method: "GET" }).handler(async () => {
  const { health } = await svc();
  return out(health());
});
