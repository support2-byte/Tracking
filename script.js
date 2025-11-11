const PUBLIC_KEY = 'frontend-public-key'; // matches env variable

async function searchShipment() {
  const refInput = document.getElementById('refInput');
  const ref = refInput.value.trim();
  if (!ref) return alert('Enter Reference ID');

  try {
    const res = await fetch(`/api/getShipment?ref=${encodeURIComponent(ref)}&key=${PUBLIC_KEY}`);
    if (!res.ok) throw new Error('Fetch failed');

    const data = await res.json();
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';

    if (!data.orders || data.orders.length === 0) {
      resultsDiv.textContent = 'No orders found';
      return;
    }

    data.orders.forEach(order => {
      const div = document.createElement('div');
      div.innerHTML = `
        <strong>Ref:</strong> ${order['Ref ID']} |
        <strong>Status:</strong> ${order.Status} |
        <strong>ETA:</strong> ${order.ETA} |
        <strong>Packages:</strong> ${order.Packages} |
        <strong>Weight:</strong> ${order['Weight (Kg)']} KG
      `;
      resultsDiv.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    alert('Error fetching shipment');
  }
}
