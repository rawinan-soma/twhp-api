import { t } from "elysia";
import {
  BaseAccountSelect,
  BaseAdminsDoedSelect,
  BaseEvaluatorSelect,
  BaseFactorySelect,
  BaseProvincialOfficerSelect,
} from ".";

export const GetMeResponse = t.Composite([
  t.Omit(BaseAccountSelect, ["password", "hashedRefreshToken"]),
  t.Object({
    adminDoed: t.Nullable(BaseAdminsDoedSelect),
    evaluator: t.Nullable(BaseEvaluatorSelect),
    factory: t.Nullable(BaseFactorySelect),
    provincial: t.Nullable(BaseProvincialOfficerSelect),
  }),
]);
