import { useState } from "react";
import { HELP_CONTENT } from "../lib/helpContent";
import { renderBold } from "../lib/formatText";
import { FilterDropdown } from "../components/common/FilterDropdown";
import "../styles/shared.css";

// Written content only for now (per the task this shipped under) — no
// interactive walkthrough mechanism yet. HelpTopic.walkthroughId is
// reserved on the content type for that later layer; nothing here reads it
// yet, so adding it in a future batch needs no restructuring of this page.
//
// Jump-to-section control: a "Jump to: <group> ▾" dropdown, reusing the
// exact same FilterDropdown component BookingsList/CustomersList already
// use for their own filters — same trigger/menu/outside-click/Escape
// behavior, no new component or CSS needed. It's a stand-in for the
// group-row-of-pills this replaced: as more groups land in later batches, a
// horizontal pill row would eventually overflow/need its own scroll on a
// narrow screen the same way the old report-nav pills did, where a dropdown
// stays exactly one tap regardless of how many groups exist. There's no
// real "current filter" here — clicking an option just scrolls to that
// section (still no scroll-spy, same reasoning as before) — so the
// dropdown's shown value is simply whichever section was jumped to last,
// starting at the first group.
const GROUP_IDS = HELP_CONTENT.map((g) => g.id);
const GROUP_LABELS = Object.fromEntries(HELP_CONTENT.map((g) => [g.id, g.title]));

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function HelpPage() {
  const [activeGroup, setActiveGroup] = useState(GROUP_IDS[0]);

  return (
    <div className="page">
      <h2>Help</h2>
      <p className="wizard-hint">Everyday questions about using the app, grouped by what you're trying to do.</p>

      <nav className="report-nav" aria-label="Jump to help section">
        <FilterDropdown
          label="Jump to"
          value={activeGroup}
          options={GROUP_IDS}
          optionLabels={GROUP_LABELS}
          onChange={(id) => {
            setActiveGroup(id);
            jumpTo(id);
          }}
        />
      </nav>

      {HELP_CONTENT.map((group) => (
        <div key={group.id} id={group.id} className="dashboard-section">
          <h2>{group.title}</h2>
          {group.topics.map((topic) => (
            <div className="wizard-card" key={topic.id} style={{ marginBottom: 16 }}>
              <div className="wizard-step">
                <h3>{topic.title}</h3>
                {topic.body.map((paragraph, i) => (
                  <p key={i}>{renderBold(paragraph)}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
