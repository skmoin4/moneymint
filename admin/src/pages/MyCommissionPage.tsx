import { useEffect, useState } from "react";
import { api } from "../api/client";
import { PageHeader } from "../components/ui/PageHeader";
import { PageLoader } from "../components/ui/PageLoader";
import { Table, THead, Th, Td, Tr } from "../components/ui/Table";
import { rangeLabel, rateLabel } from "../components/commission/format";

interface MySlab {
  chargeType: string;
  commissionType: string;
  value: string;
  minAmount: string | null;
  maxAmount: string | null;
  operator: { name: string; code: string; type: string };
}

interface MyPack {
  name: string;
  globalCommissionType: string | null;
  globalValue: string | null;
  slabs: MySlab[];
}

// Every user's own rates: what they earn (commission) or pay (surcharge) per operator.
export function MyCommissionPage() {
  const [pack, setPack] = useState<MyPack | null | undefined>(undefined);

  useEffect(() => {
    api.get("/users/my-commission").then((res) => setPack(res.data.pack));
  }, []);

  if (pack === undefined) return <PageLoader />;

  return (
    <div>
      <PageHeader title="My Commission" />
      {pack === null ? (
        <div className="rounded-sm border border-ink-200 bg-white p-6 text-center text-ink-500">
          No commission pack is assigned to you yet. Ask your distributor to assign one.
        </div>
      ) : (
        <>
          <div className="mb-3 rounded-sm border border-ink-200 bg-white px-4 py-3">
            Pack: <b>{pack.name}</b>
            {pack.globalCommissionType && (
              <span className="ml-3 text-ink-500">
                Other operators: {rateLabel({ chargeType: "COMMISSION", commissionType: pack.globalCommissionType, value: pack.globalValue ?? "0" })}
              </span>
            )}
          </div>
          <Table>
            <THead>
              <Th>Operator</Th>
              <Th>Type</Th>
              <Th>Amount range</Th>
              <Th>Your rate</Th>
            </THead>
            <tbody>
              {pack.slabs.map((s, i) => (
                <Tr key={i}>
                  <Td>{s.operator.name}</Td>
                  <Td className="capitalize">{s.operator.type.toLowerCase()}</Td>
                  <Td>{rangeLabel(s)}</Td>
                  <Td className={s.chargeType === "SURCHARGE" ? "font-semibold text-[#ed5565]" : "font-semibold text-brand-700"}>{rateLabel(s)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
