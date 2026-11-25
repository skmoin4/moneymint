import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Modal } from "./ui/Modal";
import { Table, THead, Th, Td, Tr } from "./ui/Table";

interface Entry {
  ipAddress: string | null;
  userAgent: string | null;
  details: string | null;
  createdAt: string;
}

export function LoginHistoryModal({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    api.get("/auth/login-history").then((res) => setEntries(res.data.entries));
  }, []);

  return (
    <Modal title="Login history" onClose={onClose} wide>
      {entries === null ? (
        <div className="py-6 text-center text-ink-400">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="py-6 text-center text-ink-400">No logins recorded yet.</div>
      ) : (
        <Table>
          <THead>
            <Th>Time</Th>
            <Th>IP address</Th>
            <Th>Device</Th>
          </THead>
          <tbody>
            {entries.map((e, i) => (
              <Tr key={i}>
                <Td className="whitespace-nowrap">{new Date(e.createdAt).toLocaleString("en-IN")}</Td>
                <Td className="font-mono">{e.ipAddress ?? "—"}</Td>
                <Td className="max-w-90 truncate" title={e.userAgent ?? ""}>
                  {e.userAgent ?? "—"} {e.details ? `(${e.details})` : ""}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Modal>
  );
}
