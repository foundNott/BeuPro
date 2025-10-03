let inventory = [];

function addProduct() {
  const productInput = document.getElementById('productName');
  const name = productInput.value.trim();
  if (!name) {
    alert("Please enter a product name!");
    return;
  }

  inventory.push(name); // LIFO: newest at top
  productInput.value = '';
  renderInventory();
}

function sellProduct() {
  if (inventory.length === 0) {
    alert("No products to sell!");
    return;
  }

  const soldProduct = inventory.pop();
  alert(`Sold: ${soldProduct}`);
  renderInventory();
}

function renderInventory() {
  const inventoryList = document.getElementById('inventoryList');
  inventoryList.innerHTML = '';

  // Display newest first
  for (let i = inventory.length - 1; i >= 0; i--) {
    const li = document.createElement('li');
    li.textContent = inventory[i];
    inventoryList.appendChild(li);
  }
}
