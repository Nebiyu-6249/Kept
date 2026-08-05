import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiFailure, ok, parseBody, toResponse } from "@/lib/api";
import { findCurrentUser } from "@/lib/user";
import { invalidateBudgetState } from "@/lib/budget-state";
import { slugify } from "@/lib/merchant";
import { DEFAULT_CURRENCY } from "@/lib/env";

export const dynamic = "force-dynamic";

const CategorySchema = z.strictObject({
  name: z.string().min(1).max(60),
  slug: z.string().min(1).max(60).optional(),
  limitPerPeriodFils: z.number().int().min(0).max(1_000_000_000).nullable(),
  discretionary: z.boolean(),
});

const RuleSchema = z.strictObject({
  ref: z.string().regex(/^R-\d{2,3}$/, "Rule refs look like R-01."),
  text: z.string().min(1).max(400),
  kind: z.enum(["LIMIT", "NONNEGOTIABLE", "LEAK", "HARD_RULE"]),
  order: z.number().int().min(0).max(999),
});

const PolicySchema = z.strictObject({
  displayName: z.string().min(1).max(60).optional(),
  body: z.string().min(1).max(20_000),
  rules: z.array(RuleSchema).max(60),
  categories: z.array(CategorySchema).min(1).max(40),
  monthlyIncomeFils: z.number().int().min(0).max(1_000_000_000),
  periodType: z.enum(["MONTHLY", "SEMIMONTHLY", "WEEKLY"]),
  periodAnchor: z.number().int().min(1).max(31),
});

export async function PUT(request: Request) {
  try {
    const input = await parseBody(request, PolicySchema);

    const duplicateRef = findDuplicate(input.rules.map((rule) => rule.ref));
    if (duplicateRef) {
      throw new ApiFailure(
        "VALIDATION",
        `Rule ref ${duplicateRef} is used twice. Each rule needs its own ref.`,
        "rules",
      );
    }

    const categoriesWithSlugs = input.categories.map((category) => ({
      ...category,
      slug: category.slug ?? slugify(category.name),
    }));

    const duplicateSlug = findDuplicate(categoriesWithSlugs.map((c) => c.slug));
    if (duplicateSlug) {
      throw new ApiFailure(
        "VALIDATION",
        `Two categories resolve to "${duplicateSlug}". Give them different names.`,
        "categories",
      );
    }

    // Onboarding is the entry point for a fresh install, so this creates the
    // single user when there is not one yet.
    const existing = await findCurrentUser();

    const result = await prisma.$transaction(async (tx) => {
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              ...(input.displayName ? { displayName: input.displayName } : {}),
              monthlyIncome: input.monthlyIncomeFils,
              periodType: input.periodType,
              periodAnchor: input.periodAnchor,
            },
          })
        : await tx.user.create({
            data: {
              displayName: input.displayName ?? "You",
              currency: DEFAULT_CURRENCY,
              monthlyIncome: input.monthlyIncomeFils,
              periodType: input.periodType,
              periodAnchor: input.periodAnchor,
            },
          });

      // Categories are upserted by slug and never deleted: transactions point
      // at them, and dropping a category the user removed in onboarding would
      // orphan history they can still see in the ledger.
      for (const category of categoriesWithSlugs) {
        await tx.category.upsert({
          where: { userId_slug: { userId: user.id, slug: category.slug } },
          create: {
            userId: user.id,
            name: category.name,
            slug: category.slug,
            limitPerPeriod: category.limitPerPeriodFils,
            discretionary: category.discretionary,
          },
          update: {
            name: category.name,
            limitPerPeriod: category.limitPerPeriodFils,
            discretionary: category.discretionary,
          },
        });
      }

      const previous = await tx.policy.findUnique({
        where: { userId: user.id },
        select: { id: true, version: true },
      });

      const policy = previous
        ? await tx.policy.update({
            where: { id: previous.id },
            data: { body: input.body, version: previous.version + 1 },
          })
        : await tx.policy.create({
            data: { userId: user.id, body: input.body, version: 1 },
          });

      // Rules are replaced wholesale. Intent.ruleRef is a plain string, not a
      // foreign key, so a verdict that cited R-03 keeps its citation even after
      // the policy is rewritten.
      await tx.rule.deleteMany({ where: { policyId: policy.id } });
      if (input.rules.length > 0) {
        await tx.rule.createMany({
          data: input.rules.map((rule) => ({ ...rule, policyId: policy.id })),
        });
      }

      return { userId: user.id, policyId: policy.id, version: policy.version };
    });

    invalidateBudgetState(result.userId);

    return ok({
      userId: result.userId,
      policyId: result.policyId,
      version: result.version,
      ruleCount: input.rules.length,
    });
  } catch (error) {
    return toResponse(error);
  }
}

function findDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}
