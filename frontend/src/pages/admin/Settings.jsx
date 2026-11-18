import { notify } from '../../utils/notify'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Settings2,
  Building2,
  Coins,
  Percent,
  Clock,
  MapPin,
  Camera,
  Save,
  RotateCcw,
  ArrowLeft,
  ShieldCheck,
  Sliders
} from 'lucide-react'
import { supabase } from '../../services/supabase'
import { getCurrentWorkspaceId } from '../../services/workspaces'

function Settings() {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()

  const [settingsId, setSettingsId] = useState(null)
  const [workspaceId, setWorkspaceId] = useState(null)
  const [businessName, setBusinessName] = useState('FINANCE')
  const [currencySymbol, setCurrencySymbol] = useState('₹')
  const [defaultInterestRate, setDefaultInterestRate] = useState('0')
  const [overdueGraceDays, setOverdueGraceDays] = useState('0')
  const [requireGps, setRequireGps] = useState(true)
  const [requireCollectionProof, setRequireCollectionProof] = useState(true)
  const [updatedAt, setUpdatedAt] = useState(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)

    let currentWorkspaceId
    try {
      currentWorkspaceId = await getCurrentWorkspaceId()
    } catch (error) {
      console.error('Workspace lookup error:', error)
      notify(t('settingsLoadFailed', { message: error.message }))
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('workspace_id', currentWorkspaceId)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Settings load error:', error)
      notify(t('settingsLoadFailed', { message: error.message }))
      setLoading(false)
      return
    }

    setWorkspaceId(currentWorkspaceId)
    setUpdatedAt(data?.updated_at || null)

    if (data) {
      setSettingsId(data.id)
      setBusinessName(data.business_name || 'FINANCE')
      setCurrencySymbol(data.currency_symbol || '₹')
      setDefaultInterestRate(String(data.default_interest_rate ?? 0))
      setOverdueGraceDays(String(data.overdue_grace_days ?? 0))
      setRequireGps(Boolean(data.require_gps))
      setRequireCollectionProof(Boolean(data.require_collection_proof))
    }

    setLoading(false)
  }

  const saveSettings = async (event) => {
    event.preventDefault()

    if (!settingsId || !workspaceId) {
      notify(t('settingsRecordNotFound'))
      return
    }

    if (!businessName.trim()) {
      notify(t('enterBusinessName'))
      return
    }

    if (!currencySymbol.trim()) {
      notify(t('enterCurrencySymbol'))
      return
    }

    const interestRate = Number(defaultInterestRate)
    const graceDays = Number(overdueGraceDays)

    if (Number.isNaN(interestRate) || interestRate < 0) {
      notify(t('defaultInterestRateCannotBeNegative'))
      return
    }

    if (Number.isNaN(graceDays) || graceDays < 0) {
      notify(t('overdueGraceDaysCannotBeNegative'))
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('app_settings')
      .update({
        business_name: businessName.trim(),
        currency_symbol: currencySymbol.trim(),
        default_interest_rate: interestRate,
        overdue_grace_days: Math.floor(graceDays),
        require_gps: requireGps,
        require_collection_proof: requireCollectionProof,
        updated_at: new Date().toISOString()
      })
      .eq('id', settingsId)
      .eq('workspace_id', workspaceId)

    if (error) {
      console.error('Settings update error:', error)
      notify(t('settingsSaveFailed', { message: error.message }))
      setSaving(false)
      return
    }

    notify(t('settingsSavedSuccessfully'))
    await loadSettings()
    setSaving(false)
  }

  const formatTimestamp = (value) => {
    if (!value) return t('notAvailable')

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return t('notAvailable')

    return date.toLocaleString(i18n.resolvedLanguage || i18n.language || 'en')
  }

  const resetToDefaults = () => {
    setBusinessName('FINANCE')
    setCurrencySymbol('₹')
    setDefaultInterestRate('0')
    setOverdueGraceDays('0')
    setRequireGps(true)
    setRequireCollectionProof(true)
    notify(t('settingsResetNotice'))
  }

  if (loading) {
    return (
      <div className="settings-page">
        <div className="modern-card p-12 text-center text-secondary">
          <Clock className="animate-spin mx-auto mb-3 text-primary" size={28} />
          <p>{t('loadingSettings')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="settings-page">
      <button
        type="button"
        className="modern-back-link"
        onClick={() => navigate('/admin')}
      >
        <ArrowLeft size={16} />
        <span>{t('adminDashboard')}</span>
      </button>

      <div className="modern-manage-hero">
        <div className="modern-manage-title-wrap">
          <span className="modern-loan-category-tag">
            <Sliders size={14} />
            {t('appName')}
          </span>
          <h1 className="modern-manage-heading">{t('settings')}</h1>
          <p className="text-sm text-secondary">{t('settingsDescription')}</p>
        </div>
      </div>

      <form onSubmit={saveSettings} className="settings-card">
        {/* Business & Currency */}
        <div className="settings-group">
          <div className="settings-group-title">
            <Building2 size={18} className="text-primary" />
            <span>{t('generalSettings')}</span>
          </div>

          <div className="modern-form-row">
            <div className="modern-field">
              <label htmlFor="businessName">
                {t('businessName')} *
              </label>
              <span className="text-sm text-secondary">
                {t('businessNameHint')}
              </span>
              <input
                id="businessName"
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
              />
            </div>

            <div className="modern-field">
              <label htmlFor="currencySymbol">
                {t('currencySymbol')} *
              </label>
              <span className="text-sm text-secondary">
                {t('currencySymbolHint')}
              </span>
              <input
                id="currencySymbol"
                type="text"
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
                maxLength={5}
                required
              />
            </div>
          </div>

          <div className="modern-form-row">
            <div className="modern-field">
              <label htmlFor="defaultInterestRate">
                {t('defaultInterestRate')} (%)
              </label>
              <span className="text-sm text-secondary">
                {t('defaultInterestRateHint')}
              </span>
              <input
                id="defaultInterestRate"
                type="number"
                min="0"
                step="0.01"
                value={defaultInterestRate}
                onChange={(e) => setDefaultInterestRate(e.target.value)}
              />
            </div>

            <div className="modern-field">
              <label htmlFor="overdueGraceDays">
                {t('overdueGraceDays')}
              </label>
              <span className="text-sm text-secondary">
                {t('overdueGraceDaysHint')}
              </span>
              <input
                id="overdueGraceDays"
                type="number"
                min="0"
                step="1"
                value={overdueGraceDays}
                onChange={(e) => setOverdueGraceDays(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Security & Verification Settings */}
        <div className="settings-group">
          <div className="settings-group-title">
            <ShieldCheck size={18} className="text-primary" />
            <span>{t('agentCollectionRequirements')}</span>
          </div>

          <div className="settings-toggle-row">
            <div className="settings-toggle-label">
              <span className="settings-toggle-title">{t('requireGpsDuringCollection')}</span>
              <span className="settings-toggle-desc">{t('agentMustCaptureLocation')}</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={requireGps}
                onChange={(e) => setRequireGps(e.target.checked)}
                className="w-5 h-5 accent-blue-600 rounded"
              />
            </label>
          </div>

          <div className="settings-toggle-row">
            <div className="settings-toggle-label">
              <span className="settings-toggle-title">{t('requireCollectionProofSetting')}</span>
              <span className="settings-toggle-desc">{t('agentMustUploadProof')}</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={requireCollectionProof}
                onChange={(e) => setRequireCollectionProof(e.target.checked)}
                className="w-5 h-5 accent-blue-600 rounded"
              />
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="modern-btn-secondary"
            onClick={resetToDefaults}
            disabled={saving}
          >
            <RotateCcw size={16} />
            <span>{t('resetToDefaults')}</span>
          </button>

          <button
            type="submit"
            className="modern-btn-primary"
            disabled={saving}
          >
            <Save size={16} />
            <span>{saving ? t('saving') : t('saveSettings')}</span>
          </button>
        </div>
      </form>

      {/* Configuration Summary Card */}
      <div className="modern-card">
        <div className="modern-card-header">
          <div className="modern-card-title">
            <Sliders size={18} className="text-primary" />
            <span>{t('currentConfiguration')}</span>
          </div>
        </div>

        <div className="modern-info-grid">
          <div className="modern-info-item">
            <span className="modern-info-label">{t('business')}</span>
            <span className="modern-info-val">{businessName}</span>
          </div>
          <div className="modern-info-item">
            <span className="modern-info-label">{t('currency')}</span>
            <span className="modern-info-val">{currencySymbol}</span>
          </div>
          <div className="modern-info-item">
            <span className="modern-info-label">{t('defaultInterest')}</span>
            <span className="modern-info-val">{defaultInterestRate}%</span>
          </div>
          <div className="modern-info-item">
            <span className="modern-info-label">{t('overdueGracePeriod')}</span>
            <span className="modern-info-val">
              {t('dayCount', {
                count: overdueGraceDays,
                unit: t(Number(overdueGraceDays) === 1 ? 'day' : 'days')
              })}
            </span>
          </div>
          <div className="modern-info-item">
            <span className="modern-info-label">{t('gpsRequired')}</span>
            <span className="modern-info-val">{requireGps ? t('yes') : t('no')}</span>
          </div>
          <div className="modern-info-item">
            <span className="modern-info-label">{t('collectionProofRequiredLabel')}</span>
            <span className="modern-info-val">{requireCollectionProof ? t('yes') : t('no')}</span>
          </div>
        </div>
      </div>

      {/* Workspace Information Card */}
      <div className="modern-card">
        <div className="modern-card-header">
          <div className="modern-card-title">
            <Building2 size={18} className="text-primary" />
            <span>{t('workspaceInformation')}</span>
          </div>
        </div>

        <div className="modern-info-grid">
          <div className="modern-info-item">
            <span className="modern-info-label">{t('workspaceId')}</span>
            <span
              className="modern-info-val"
              title={workspaceId || t('notAvailable')}
              style={{ wordBreak: 'break-all', fontSize: 13 }}
            >
              {workspaceId || t('notAvailable')}
            </span>
          </div>
          <div className="modern-info-item">
            <span className="modern-info-label">{t('lastUpdated')}</span>
            <span className="modern-info-val">
              {formatTimestamp(updatedAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
