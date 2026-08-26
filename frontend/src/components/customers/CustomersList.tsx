import { Fragment, useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_CATEGORY_FILTER_LABELS,
  deleteCustomer,
  fetchCustomers,
  type Customer,
  type CustomerCategoryFilter,
} from "../../lib/customers";
import { FilterDropdown } from "../common/FilterDropdown";
import { TableRowsSkeleton } from "../common/Skeleton";
import { useSlowLoadHint } from "../../lib/useSlowLoadHint";
import { AlphabetIndex } from "./AlphabetIndex";

// A stable "#" here, not the first group's actual sort position — a name
// starting with a digit can sort before "A" under localeCompare, but the
// side index still shows # last, same as a phone contacts app, since the
// index is a fixed A-Z reference, not a mirror of on-screen order.
function letterHeaderId(letter: string): string {
  return `customer-letter-${letter === "#" ? "hash" : letter}`;
}

export function CustomersList({
  onEdit,
  onView,
}: {
  onEdit: (customer: Customer) => void;
  onView: (customer: Customer) => void;
}) {
  const [term, setTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CustomerCategoryFilter>("all");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      fetchCustomers({ search: term, customer_type: categoryFilter })
        .then((data) => {
          // A newer search may have started (and possibly already resolved)
          // while this request was in flight — an older response landing
          // late must not clobber the newer results.
          if (!cancelled) {
            // Mobile-contacts-style A-Z order, not the backend's
            // newest-first default (which is right for other callers of
            // fetchCustomers, e.g. CustomerPicker's recency-biased quick
            // search — this sort is scoped to this list only).
            const sorted = [...data].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
            setCustomers(sorted);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [term, categoryFilter]);

  // Groups the already-sorted list into contacts-app-style letter sections —
  // a name starting with anything other than A-Z (digit, symbol) falls under
  // "#", same fallback bucket a phone contacts app uses.
  const letterGroups: { letter: string; customers: Customer[] }[] = [];
  for (const c of customers) {
    const first = c.name.trim().charAt(0).toUpperCase();
    const letter = first >= "A" && first <= "Z" ? first : "#";
    const lastGroup = letterGroups[letterGroups.length - 1];
    if (lastGroup && lastGroup.letter === letter) {
      lastGroup.customers.push(c);
    } else {
      letterGroups.push({ letter, customers: [c] });
    }
  }

  // Canonical A-Z-then-# order for the side index, independent of
  // letterGroups' actual on-screen order (see letterHeaderId's comment).
  const presentLetters = new Set(letterGroups.map((g) => g.letter));
  const indexLetters = [
    ...[...presentLetters].filter((l) => l !== "#").sort(),
    ...(presentLetters.has("#") ? ["#"] : []),
  ];

  function jumpToLetter(letter: string) {
    document.getElementById(letterHeaderId(letter))?.scrollIntoView({ behavior: "auto", block: "start" });
  }

  async function confirmDelete(customer: Customer) {
    setDeletingId(customer.id);
    setActionError(null);
    try {
      await deleteCustomer(customer.id);
      setCustomers((prev) => prev.filter((c) => c.id !== customer.id));
      setConfirmingId(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete customer");
    } finally {
      setDeletingId(null);
    }
  }

  // Every loading state gets the skeleton, including a filter/search change
  // over rows already on screen — not just the first load. Previously a
  // filter change kept the old (now-stale) rows visible under a plain
  // "Searching…" line, which read as if nothing was happening; the
  // skeleton makes the in-flight request visually obvious every time.
  const showSkeleton = loading;
  const showSlowHint = useSlowLoadHint(showSkeleton);

  return (
    <div>
      <input
        className="search-input"
        type="text"
        placeholder="Search by name or phone…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      <div className="filter-dropdown-bar">
        <FilterDropdown
          label="Category"
          value={categoryFilter}
          options={Object.keys(CUSTOMER_CATEGORY_FILTER_LABELS) as CustomerCategoryFilter[]}
          optionLabels={CUSTOMER_CATEGORY_FILTER_LABELS}
          onChange={setCategoryFilter}
        />
      </div>
      <div className="list-header">
        <h2>
          {term
            ? `Results (${customers.length})`
            : categoryFilter !== "all"
              ? `${CUSTOMER_CATEGORY_FILTER_LABELS[categoryFilter]} (${customers.length})`
              : `All Customers (${customers.length})`}
        </h2>
      </div>

      {actionError && <p className="wizard-error">{actionError}</p>}

      {showSkeleton && (
        <>
          <TableRowsSkeleton />
          {showSlowHint && (
            <p className="wizard-hint slow-load-hint">
              Still loading. The server may be waking up after a period of inactivity, which can take up to a
              minute.
            </p>
          )}
        </>
      )}

      {!loading && customers.length === 0 && (
        <div className="empty-state">
          {term ? (
            <>
              <h3>No matches</h3>
              <p>Nobody found for "{term}" — check the spelling or try just the phone number.</p>
            </>
          ) : categoryFilter !== "all" ? (
            <>
              <h3>No {CUSTOMER_CATEGORY_FILTER_LABELS[categoryFilter]} customers</h3>
              <p>No customers are tagged {CUSTOMER_CATEGORY_FILTER_LABELS[categoryFilter]} yet.</p>
            </>
          ) : (
            <>
              <h3>No customers yet</h3>
              <p>Add your first customer, or create one while booking.</p>
            </>
          )}
        </div>
      )}

      {!loading && customers.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Address</th>
                <th>Type</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {letterGroups.map((group) => (
                <Fragment key={`letter-${group.letter}`}>
                  <tr className="customer-letter-header" id={letterHeaderId(group.letter)}>
                    <td colSpan={6}>{group.letter}</td>
                  </tr>
                  {group.customers.map((c) => (
                    <tr key={c.id}>
                      <td data-label="Name">
                        <button type="button" className="link-button" onClick={() => onView(c)}>
                          {c.name}
                        </button>
                      </td>
                      <td data-label="Phone">{c.phone}</td>
                      <td data-label="Email">{c.email ?? "—"}</td>
                      <td data-label="Address">{c.address}</td>
                      <td data-label="Type">{CUSTOMER_TYPE_LABELS[c.customer_type]}</td>
                      <td className="row-actions">
                        {confirmingId === c.id ? (
                          <>
                            <span>Delete this customer?</span>
                            <button
                              className="btn-danger"
                              onClick={() => confirmDelete(c)}
                              disabled={deletingId === c.id}
                            >
                              {deletingId === c.id ? "…" : "Yes, Delete"}
                            </button>
                            <button className="btn-secondary" onClick={() => setConfirmingId(null)}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn-icon" aria-label="Edit" onClick={() => onEdit(c)}>
                              <Pencil size={16} strokeWidth={2} aria-hidden="true" />
                            </button>
                            <button
                              className="btn-icon btn-icon-danger"
                              aria-label="Delete"
                              onClick={() => setConfirmingId(c.id)}
                            >
                              <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlphabetIndex letters={indexLetters} onSelect={jumpToLetter} />
    </div>
  );
}
