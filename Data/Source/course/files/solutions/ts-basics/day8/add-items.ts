function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function addToCart(item: string): Promise<void> {
  await sleep(100);
  console.log(`added ${item}`);
}

async function fillCart(items: string[]): Promise<number> {
  for (const item of items) {
    await addToCart(item);
  }
  return items.length;
}

const count = await fillCart(['Monitor', 'Webcam', 'Headset']);
console.log(`${count} items in the cart`);
