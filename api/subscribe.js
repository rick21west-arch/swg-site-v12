export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const email = req.body && req.body.email;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  const apiKey = process.env.KIT_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-Kit-Api-Key': apiKey,
  };
  const body = JSON.stringify({ email_address: email });

  try {
    // Step 1: create the subscriber (required before adding to a form)
    const createRes = await fetch('https://api.kit.com/v4/subscribers', {
      method: 'POST',
      headers,
      body,
    });

    if (!createRes.ok) {
      const createBody = await createRes.text();
      console.error('Kit create subscriber failed:', createRes.status, createBody);
      return res.status(createRes.status).json({ error: 'Subscription failed' });
    }

    // Step 2: add subscriber to the form (best-effort; email already captured)
    try {
      const formRes = await fetch(
        'https://api.kit.com/v4/forms/9740544/subscribers',
        {
          method: 'POST',
          headers,
          body,
        }
      );

      if (!formRes.ok) {
        const formBody = await formRes.text();
        console.error('Kit add to form failed:', formRes.status, formBody);
      }
    } catch (formErr) {
      console.error('Kit add to form error:', formErr);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Kit create subscriber error:', err);
    return res.status(500).json({ error: 'Subscription failed' });
  }
}
