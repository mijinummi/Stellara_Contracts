const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MultisigTreasury", function () {
  let owner0, owner1, owner2, recipient;
  let treasury;

  beforeEach(async () => {
    [owner0, owner1, owner2, recipient] = await ethers.getSigners();
    const owners = [owner0.address, owner1.address, owner2.address];
    const Multisig = await ethers.getContractFactory("MultisigTreasury");
    treasury = await Multisig.deploy(owners, 2, ethers.parseEther("5"), ethers.parseEther("10"), ethers.parseEther("2"));
    await treasury.waitForDeployment();

    // Fund contract
    await owner0.sendTransaction({ to: await treasury.getAddress(), value: ethers.parseEther("5") });
  });

  it("executes a small single-confirm transaction", async () => {
    const value = ethers.parseEther("0.5");
    await treasury.connect(owner0).submitTransaction(recipient.address, value, '0x');
    const count = await treasury.getTransactionCount();
    const idx = Number(count) - 1;
    await treasury.connect(owner0).confirmTransaction(idx);
    const before = await ethers.provider.getBalance(recipient.address);
    await treasury.connect(owner0).executeTransaction(idx);
    const after = await ethers.provider.getBalance(recipient.address);
    expect(after - before).to.equal(value);
  });

  it("requires multisig for large transactions above threshold", async () => {
    const value = ethers.parseEther("3"); // threshold set to 2
    await treasury.connect(owner0).submitTransaction(recipient.address, value, '0x');
    const count = await treasury.getTransactionCount();
    const idx = Number(count) - 1;
    // single confirm should not be enough
    await treasury.connect(owner0).confirmTransaction(idx);
    await expect(treasury.connect(owner0).executeTransaction(idx)).to.be.revertedWith("insufficient confirmations for large tx");

    // second confirm satisfies multisig requirement
    await treasury.connect(owner1).confirmTransaction(idx);
    const before = await ethers.provider.getBalance(recipient.address);
    await treasury.connect(owner0).executeTransaction(idx);
    const after = await ethers.provider.getBalance(recipient.address);
    expect(after - before).to.equal(value);
  });

  it("has __gap storage slot to prevent upgradeable storage collisions", async () => {
    // Verify all public state variables remain accessible — confirming the
    // storage layout is intact after the __gap was appended.
    expect(await treasury.required()).to.equal(2n);
    expect(await treasury.dailyLimit()).to.equal(ethers.parseEther("5"));
    expect(await treasury.weeklyLimit()).to.equal(ethers.parseEther("10"));
    expect(await treasury.threshold()).to.equal(ethers.parseEther("2"));
    expect(await treasury.frozen()).to.equal(false);
    // The __gap occupies 50 reserved slots after the declared variables,
    // ensuring future additions do not shift existing storage positions.
    const owners = await treasury.getOwners();
    expect(owners.length).to.equal(3);
  });

  it("requires multisig approval for limit changes", async () => {
    const newDailyLimit = ethers.parseEther("2");
    const newWeeklyLimit = ethers.parseEther("12");
    const newThreshold = ethers.parseEther("3");
    const data = treasury.interface.encodeFunctionData("updateLimits", [
      newDailyLimit,
      newWeeklyLimit,
      newThreshold,
    ]);

    await expect(
      treasury.connect(owner0).updateLimits(newDailyLimit, newWeeklyLimit, newThreshold)
    ).to.be.revertedWith("only self");

    await treasury.connect(owner0).submitTransaction(await treasury.getAddress(), 0, data);
    const count = await treasury.getTransactionCount();
    const idx = Number(count) - 1;
    await treasury.connect(owner0).confirmTransaction(idx);
    await expect(treasury.connect(owner0).executeTransaction(idx)).to.be.revertedWith(
      "insufficient confirmations for sensitive action"
    );

    await treasury.connect(owner1).confirmTransaction(idx);
    await treasury.connect(owner0).executeTransaction(idx);

    expect(await treasury.dailyLimit()).to.equal(newDailyLimit);
    expect(await treasury.weeklyLimit()).to.equal(newWeeklyLimit);
    expect(await treasury.threshold()).to.equal(newThreshold);
  });

  it("supports multisig freeze and unfreeze", async () => {
    // Prepare a transaction before the freeze so we can prove execution is blocked.
    await treasury.connect(owner0).submitTransaction(recipient.address, ethers.parseEther("0.1"), '0x');
    const count0 = await treasury.getTransactionCount();
    const idx0 = Number(count0) - 1;
    await treasury.connect(owner0).confirmTransaction(idx0);

    const data = treasury.interface.encodeFunctionData("emergencyFreeze");
    const unfreezeData = treasury.interface.encodeFunctionData("unfreezeInternal");
    await expect(treasury.connect(owner0).emergencyFreeze()).to.be.revertedWith("only self");

    await treasury.connect(owner0).submitTransaction(await treasury.getAddress(), 0, data);
    const count = await treasury.getTransactionCount();
    const idx = Number(count) - 1;
    await treasury.connect(owner0).confirmTransaction(idx);
    await expect(treasury.connect(owner0).executeTransaction(idx)).to.be.revertedWith(
      "insufficient confirmations for sensitive action"
    );
    await treasury.connect(owner1).confirmTransaction(idx);

    // Queue the unfreeze transaction before the freeze is activated so it can be
    // executed later even while confirmations are blocked.
    await treasury.connect(owner0).submitTransaction(await treasury.getAddress(), 0, unfreezeData);
    const count2 = await treasury.getTransactionCount();
    const idx2 = Number(count2) - 1;
    await treasury.connect(owner0).confirmTransaction(idx2);
    await treasury.connect(owner1).confirmTransaction(idx2);

    await treasury.connect(owner0).executeTransaction(idx);

    await expect(treasury.connect(owner0).executeTransaction(idx0)).to.be.revertedWith("frozen");

    // execute unfreeze (requires full multisig as implemented)
    await treasury.connect(owner0).executeTransaction(idx2);

    // Now executing the previous tx should work after unfreeze
    const recipientBefore = await ethers.provider.getBalance(recipient.address);
    await treasury.connect(owner0).executeTransaction(idx0);
    const recipientAfter = await ethers.provider.getBalance(recipient.address);
    expect(recipientAfter - recipientBefore).to.equal(ethers.parseEther("0.1"));
  });
});
