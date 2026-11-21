import { useState, useEffect } from 'react'
import { getApiUrl } from '../config/api'
import {
  PlusCircle,
  Search,
  ArrowRight,
  Construction,
  Trash2,
  Droplets,
  Lightbulb,
  ShieldCheck,
  HelpCircle,
  CheckCircle2,
  Sparkles,
  MapPin,
  Cpu
} from 'lucide-react'

export default function CitizenHome({ setCurrentView, setSelectedCategory }) {
  const [stats, setStats] = useState(null)
  const [recentIssues, setRecentIssues] = useState([])

  useEffect(() => {
    async function loadData() {
      try {
        const [statsRes, issuesRes] = await Promise.all([
          fetch(getApiUrl('/api/issues/pulse')),
          fetch(getApiUrl('/api/issues/feed?limit=4'))
        ])

        if (statsRes.ok) {
          const statsData = await statsRes.json()
          setStats(statsData)
        }
        if (issuesRes.ok) {
          const issuesData = await issuesRes.json()
          setRecentIssues(issuesData.issues || [])
        }
      } catch (err) {
        console.error('Failed to load homepage data:', err)
      }
    }
    loadData()
  }, [])

  const categories = [
    {
      id: 'Roads & Potholes',
      icon: Construction,
      color: 'cat-amber',
      desc: 'Potholes, damaged asphalt, sinking footpaths, road cracks'
    },
    {
      id: 'Sanitation & Waste',
      icon: Trash2,
      color: 'cat-emerald',
      desc: 'Overflowing dumpsters, uncollected garbage, illegal dumping'
    },
    {
      id: 'Water & Drainage',
      icon: Droplets,
      color: 'cat-blue',
      desc: 'Burst water pipes, sewage overflow, clogged storm drains'
    },
    {
      id: 'Streetlights & Electrical',
      icon: Lightbulb,
      color: 'cat-purple',
      desc: 'Dark streets, sparking utility poles, hanging live wires'
    },
    {
      id: 'Public Safety',
      icon: ShieldCheck,
      color: 'cat-rose',
      desc: 'Open manholes, collapsing walls, gas leaks, safety hazards'
    },
    {
      id: 'Other',
      icon: HelpCircle,
      color: 'cat-slate',
      desc: 'Public park benches, signage, general municipal concerns'
    }
  ]

  const handleCategoryClick = (catId) => {
    if (setSelectedCategory) setSelectedCategory(catId)
    setCurrentView('report')
  }

  return (
    <div className="home-container">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-badge">
          <Sparkles size={14} className="sparkle-icon" />
          <span>Next-Generation Civic Intelligence</span>
        </div>
        <h1 className="hero-heading">
          Building Better Communities,<br />
          <span>One Resolution at a Time.</span>
        </h1>
        <p className="hero-subtext">
          Report civic issues, track their progress, and help create cleaner, safer and better-connected communities. Powered by intelligent Gemini AI triage to evaluate hazard urgency, identify duplicates, and accelerate operational dispatch.
        </p>

        <div className="hero-cta-group">
          <button
            onClick={() => setCurrentView('report')}
            className="btn-primary-lg"
          >
            <PlusCircle size={18} />
            <span>Report an Issue Now</span>
            <ArrowRight size={16} />
          </button>
          <button
            onClick={() => setCurrentView('track')}
            className="btn-secondary-lg"
          >
            <Search size={18} />
            <span>Track Your Complaint</span>
          </button>
        </div>
      </section>

      {/* Live City Pulse Stats */}
      <section className="stats-row">
        <div className="stat-card">
          <div className="stat-number">{stats ? stats.total_issues : '—'}</div>
          <div className="stat-label">Total Reports Filed</div>
        </div>
        <div className="stat-card">
          <div className="stat-number stat-blue">
            {stats ? (stats.by_status?.['In Progress'] || 0) : '—'}
          </div>
          <div className="stat-label">In Progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-number stat-green">
            {stats ? (stats.by_status?.['Resolved'] || 0) : '—'}
          </div>
          <div className="stat-label">Resolved</div>
        </div>
        <div className="stat-card">
          <div className="stat-number stat-purple">
            {stats ? `${stats.duplicates_detected || 0}` : '—'}
          </div>
          <div className="stat-label">Duplicates Merged</div>
        </div>
      </section>

      {/* Category Explorer */}
      <section className="section-block">
        <div className="section-header">
          <div>
            <h2 className="section-title">Common Civic Issues</h2>
            <p className="section-desc">Select a category below to quickly file a complaint with automated department routing</p>
          </div>
        </div>

        <div className="category-grid">
          {categories.map((cat) => {
            const Icon = cat.icon
            return (
              <div
                key={cat.id}
                className={`category-card ${cat.color}`}
                onClick={() => handleCategoryClick(cat.id)}
              >
                <div className="cat-icon-wrap">
                  <Icon size={24} />
                </div>
                <h3 className="cat-title">{cat.id}</h3>
                <p className="cat-desc">{cat.desc}</p>
                <div className="cat-action">
                  <span>Report this &rarr;</span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* How It Works */}
      <section className="section-block how-it-works-block">
        <h2 className="section-title text-center">How CivicResolve Works</h2>
        <p className="section-desc text-center">Transparent 3-stage civic workflow powered by artificial intelligence</p>

        <div className="steps-grid">
          <div className="step-card">
            <div className="step-badge">Step 1</div>
            <div className="step-icon-box">
              <MapPin size={26} />
            </div>
            <h3>Citizen Reports</h3>
            <p>Provide a quick description, location, and optional photo of the issue. You receive a unique tracking ID instantly.</p>
          </div>

          <div className="step-card">
            <div className="step-badge">Step 2</div>
            <div className="step-icon-box">
              <Cpu size={26} />
            </div>
            <h3>Gemini AI Triages</h3>
            <p>AI assesses true hazard risk (Critical, High, Medium, Low), inspects photo evidence, detects duplicates, and assigns the responsible department.</p>
          </div>

          <div className="step-card">
            <div className="step-badge">Step 3</div>
            <div className="step-icon-box">
              <CheckCircle2 size={26} />
            </div>
            <h3>Action &amp; Resolution</h3>
            <p>Municipal field teams are dispatched with suggested operational actions. Citizens track live status until resolution.</p>
          </div>
        </div>
      </section>

      {/* Recent Community Issues */}
      {recentIssues.length > 0 && (
        <section className="section-block">
          <div className="section-header">
            <div>
              <h2 className="section-title">Recent Community Complaints</h2>
              <p className="section-desc">Public issues currently being tracked across the community</p>
            </div>
            <button
              onClick={() => setCurrentView('feed')}
              className="view-all-link"
            >
              View All Issues &rarr;
            </button>
          </div>

          <div className="recent-issues-grid">
            {recentIssues.map((issue, idx) => (
              <div
                key={`${issue.category}-${issue.created_at}-${idx}`}
                className="issue-preview-card"
                onClick={() => setCurrentView('feed')}
              >
                <div className="issue-preview-header">
                  <span className="category-badge-sm">{issue.category}</span>
                  <span className={`priority-tag priority-${(issue.priority || 'Medium').toLowerCase()}`}>
                    {issue.priority || 'Medium'}
                  </span>
                </div>
                <h4 className="issue-preview-title">{issue.title}</h4>
                <p className="issue-preview-desc">{issue.description ? issue.description.slice(0, 110) + '...' : ''}</p>
                <div className="issue-preview-meta">
                  <span><MapPin size={13} /> {issue.location}</span>
                  <span className={`status-pill status-${issue.status.toLowerCase().replace(/\s+/g, '-')}`}>
                    {issue.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
