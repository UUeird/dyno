import React from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Human } from "../types";
import { modelPath } from "../lib/modelSlug";
import { API } from "../lib/api";

type ModelResult = { manufacturer: string; model: string };
type SearchResults = { models: ModelResult[]; users: Human[] };

export default function SearchBar() {
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResults>({ models: [], users: [] });
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults({ models: [], users: [] });
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      axios.get(`${API}/search`, { params: { q } })
        .then((r) => { if (!cancelled) setResults(r.data); })
        .catch(() => { if (!cancelled) setResults({ models: [], users: [] }); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    setQuery("");
    navigate(path);
  };

  const hasResults = results.models.length > 0 || results.users.length > 0;
  const showDropdown = open && query.trim().length >= 2;

  return (
    <div className="search-bar" ref={wrapRef}>
      <input
        type="text"
        className="search-input"
        placeholder="Search cars and people"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {showDropdown && (
        <div className="search-dropdown">
          {!hasResults && (
            <p className="search-empty">No results</p>
          )}
          {results.models.length > 0 && (
            <div className="search-section">
              <h4 className="search-section-title">Models</h4>
              <ul className="search-results">
                {results.models.map((m) => (
                  <li
                    key={`${m.manufacturer}|${m.model}`}
                    className="search-result"
                    onClick={() => go(modelPath(m.manufacturer, m.model))}
                  >
                    {m.manufacturer} {m.model}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {results.users.length > 0 && (
            <div className="search-section">
              <h4 className="search-section-title">People</h4>
              <ul className="search-results">
                {results.users.map((u) => (
                  <li
                    key={u._id}
                    className="search-result"
                    onClick={() => go(`/users/${u._id}`)}
                  >
                    {u.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
