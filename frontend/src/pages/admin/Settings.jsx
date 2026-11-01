import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../services/supabase'

function Settings() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const [settingsId, setSettingsId] = useState(null)

  const [businessName, setBusinessName] =
    useState('FINANCE')

  const [currencySymbol, setCurrencySymbol] =
    useState('₹')

  const [defaultInterestRate, setDefaultInterestRate] =
    useState('0')

  const [overdueGraceDays, setOverdueGraceDays] =
    useState('0')

  const [requireGps, setRequireGps] =
    useState(true)

  const [
    requireCollectionProof,
    setRequireCollectionProof
  ] = useState(true)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Settings load error:', error)
      alert(t('settingsLoadFailed', { message: error.message }))
      setLoading(false)
      return
    }

    if (data) {
      setSettingsId(data.id)

      setBusinessName(
        data.business_name || 'FINANCE'
      )

      setCurrencySymbol(
        data.currency_symbol || '₹'
      )

      setDefaultInterestRate(
        String(data.default_interest_rate ?? 0)
      )

      setOverdueGraceDays(
        String(data.overdue_grace_days ?? 0)
      )

      setRequireGps(
        Boolean(data.require_gps)
      )

      setRequireCollectionProof(
        Boolean(data.require_collection_proof)
      )
    }

    setLoading(false)
  }

  const saveSettings = async (event) => {
    event.preventDefault()

    if (!settingsId) {
      alert(t('settingsRecordNotFound'))
      return
    }

    if (!businessName.trim()) {
      alert(t('enterBusinessName'))
      return
    }

    if (!currencySymbol.trim()) {
      alert(t('enterCurrencySymbol'))
      return
    }

    const interestRate =
      Number(defaultInterestRate)

    const graceDays =
      Number(overdueGraceDays)

    if (
      Number.isNaN(interestRate) ||
      interestRate < 0
    ) {
      alert(t('defaultInterestRateCannotBeNegative'))
      return
    }

    if (
      Number.isNaN(graceDays) ||
      graceDays < 0
    ) {
      alert(t('overdueGraceDaysCannotBeNegative'))
      return
    }

    setSaving(true)

    const { error } = await supabase
      .from('app_settings')
      .update({
        business_name: businessName.trim(),

        currency_symbol:
          currencySymbol.trim(),

        default_interest_rate:
          interestRate,

        overdue_grace_days:
          Math.floor(graceDays),

        require_gps:
          requireGps,

        require_collection_proof:
          requireCollectionProof,

        updated_at:
          new Date().toISOString()
      })
      .eq('id', settingsId)

    if (error) {
      console.error(
        'Settings update error:',
        error
      )

      alert(t('settingsSaveFailed', { message: error.message }))

      setSaving(false)
      return
    }

    alert(t('settingsSavedSuccessfully'))

    await loadSettings()

    setSaving(false)
  }

  if (loading) {
    return (
      <div className="weekly-page">
        <p>{t('appName')}</p>

        <h1>{t('settings')}</h1>

        <p>{t('loadingSettings')}</p>
      </div>
    )
  }

  return (
    <div className="weekly-page">
      <p>{t('appName')}</p>

      <h1>{t('settings')}</h1>

      <p>{t('settingsDescription')}</p>

      <button
        type="button"
        onClick={() => navigate('/admin')}
        style={{ marginBottom: '20px' }}
      >
        ← {t('adminDashboard')}
      </button>

      <div className="weekly-summary">
        <h2>{t('generalSettings')}</h2>

        <form onSubmit={saveSettings}>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns:
                'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '20px',
              marginTop: '20px'
            }}
          >
            <div>
              <label>
                <strong>
                  {t('businessName')} *
                </strong>
              </label>

              <br />

              <input
                type="text"
                value={businessName}
                onChange={(e) =>
                  setBusinessName(
                    e.target.value
                  )
                }
                style={{
                  width: '100%',
                  padding: '10px',
                  marginTop: '8px'
                }}
              />
            </div>

            <div>
              <label>
                <strong>
                  {t('currencySymbol')} *
                </strong>
              </label>

              <br />

              <input
                type="text"
                value={currencySymbol}
                onChange={(e) =>
                  setCurrencySymbol(
                    e.target.value
                  )
                }
                maxLength={5}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginTop: '8px'
                }}
              />
            </div>

            <div>
              <label>
                <strong>
                  {t('defaultInterestRate')} (%)
                </strong>
              </label>

              <br />

              <input
                type="number"
                min="0"
                step="0.01"
                value={defaultInterestRate}
                onChange={(e) =>
                  setDefaultInterestRate(
                    e.target.value
                  )
                }
                style={{
                  width: '100%',
                  padding: '10px',
                  marginTop: '8px'
                }}
              />
            </div>

            <div>
              <label>
                <strong>
                  {t('overdueGraceDays')}
                </strong>
              </label>

              <br />

              <input
                type="number"
                min="0"
                step="1"
                value={overdueGraceDays}
                onChange={(e) =>
                  setOverdueGraceDays(
                    e.target.value
                  )
                }
                style={{
                  width: '100%',
                  padding: '10px',
                  marginTop: '8px'
                }}
              />
            </div>
          </div>

          <div
            style={{
              marginTop: '30px',
              padding: '20px',
              border: '1px solid #d8e0ea',
              borderRadius: '12px'
            }}
          >
            <h2>
              {t('agentCollectionRequirements')}
            </h2>

            <div
              style={{
                marginTop: '20px'
              }}
            >
              <label
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center'
                }}
              >
                <input
                  type="checkbox"
                  checked={requireGps}
                  onChange={(e) =>
                    setRequireGps(
                      e.target.checked
                    )
                  }
                />

                <strong>
                  {t('requireGpsDuringCollection')}
                </strong>
              </label>

              <p
                style={{
                  marginLeft: '25px'
                }}
              >
                {t('agentMustCaptureLocation')}
              </p>
            </div>

            <div
              style={{
                marginTop: '20px'
              }}
            >
              <label
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center'
                }}
              >
                <input
                  type="checkbox"
                  checked={
                    requireCollectionProof
                  }
                  onChange={(e) =>
                    setRequireCollectionProof(
                      e.target.checked
                    )
                  }
                />

                <strong>
                  {t('requireCollectionProofSetting')}
                </strong>
              </label>

              <p
                style={{
                  marginLeft: '25px'
                }}
              >
                {t('agentMustUploadProof')}
              </p>
            </div>
          </div>

          <div
            style={{
              marginTop: '25px'
            }}
          >
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '12px 24px',
                fontWeight: 'bold'
              }}
            >
              {saving
                ? t('saving')
                : t('saveSettings')}
            </button>
          </div>
        </form>
      </div>

      <div
        className="weekly-summary"
        style={{
          marginTop: '20px'
        }}
      >
        <h2>{t('currentConfiguration')}</h2>

        <p>
          {t('business')}:{' '}
          <strong>{businessName}</strong>
        </p>

        <p>
          {t('currency')}:{' '}
          <strong>{currencySymbol}</strong>
        </p>

        <p>
          {t('defaultInterest')}:{' '}
          <strong>
            {defaultInterestRate}%
          </strong>
        </p>

        <p>
          {t('overdueGracePeriod')}:{' '}
          <strong>
            {t('dayCount', {
              count: overdueGraceDays,
              unit: t(Number(overdueGraceDays) === 1 ? 'day' : 'days')
            })}
          </strong>
        </p>

        <p>
          {t('gpsRequired')}:{' '}
          <strong>
            {requireGps ? t('yes') : t('no')}
          </strong>
        </p>

        <p>
          {t('collectionProofRequiredLabel')}:{' '}
          <strong>
            {requireCollectionProof ? t('yes') : t('no')}
          </strong>
        </p>
      </div>
    </div>
  )
}

export default Settings