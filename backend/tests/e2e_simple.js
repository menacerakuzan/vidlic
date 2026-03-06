// Simple end-to-end smoke test: login and fetch analytics dashboard
(async () => {
  const loginUrl = 'http://localhost:3000/api/v1/auth/login'
  const analyticsUrl = 'http://localhost:3000/api/v1/analytics/dashboard'

  // Login
  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@vidlik.gov.ua', password: 'SecurePass123!' }),
  })
  if (!loginRes.ok) {
    console.error('Login failed', await loginRes.text())
    process.exit(1)
  }
  const loginData = await loginRes.json()
  const token = loginData.accessToken
  if (!token) {
    console.error('No access token returned')
    process.exit(1)
  }

  // Analytics
  const analyticsRes = await fetch(analyticsUrl, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!analyticsRes.ok) {
    console.error('Analytics fetch failed', analyticsRes.status, await analyticsRes.text())
    process.exit(1)
  }
  const analytics = await analyticsRes.json()
  console.log('Analytics dashboard data loaded:', Object.keys(analytics).length, 'top keys:', Object.keys(analytics).slice(0,3))
  process.exit(0)
})().catch(e => {
  console.error('Test error:', e)
  process.exit(2)
});
