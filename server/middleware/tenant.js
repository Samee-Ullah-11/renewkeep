import Company from "../models/Company.js";

/**
 * tenantScope — the single place multi-tenant isolation lives. Mount it
 * (after protect) on every router that touches items, files, reminders or
 * team data. It attaches:
 *   req.tenantFilter — { companyId } that EVERY query must spread into its
 *                      filter, e.g. Item.findOne({ _id, ...req.tenantFilter })
 *   req.company      — the company doc (timezone, itemLimit) so routes don't
 *                      re-fetch it.
 * A route that uses req.tenantFilter can never leak another tenant's data.
 */
export async function tenantScope(req, res, next) {
  try {
    if (!req.user?.companyId)
      return res.status(401).json({ message: "No company on this account" });

    const company = await Company.findById(req.user.companyId);
    if (!company)
      return res.status(401).json({ message: "Company no longer exists" });

    req.company = company;
    req.tenantFilter = { companyId: company._id };
    next();
  } catch (err) {
    console.error("tenantScope error:", err);
    res.status(500).json({ message: "Could not load company" });
  }
}
