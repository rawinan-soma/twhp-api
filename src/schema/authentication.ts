import {
  BaseAccountSelect,
  BaseAdminsDoedSelect,
  BaseEvaluatorSelect,
  BaseFactorySelect,
  BaseProvincialOfficerSelect,
} from ".";
import { t } from "elysia";

export const GetMeResponse = t.Composite([
  t.Omit(BaseAccountSelect, ["password", "hashedRefreshToken"]),
  t.Object({
    adminDoed: t.Nullable(BaseAdminsDoedSelect),
    evaluator: t.Nullable(BaseEvaluatorSelect),
    factory: t.Nullable(BaseFactorySelect),
    provincial: t.Nullable(BaseProvincialOfficerSelect),
  }),
]);
