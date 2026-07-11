export default function OptionsCalcTab({
  C, MONO, SANS,
  optionType, setOptionType, optionStrike, setOptionStrike, optionPremium, setOptionPremium,
  optionStock, setOptionStock, optionExpiry, setOptionExpiry, computeOptions, optionResult,
}) {
        const card = (extra = {}) => ({ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, ...extra });
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ ...card({ padding: "14px 18px" }) }}>
              <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 900, color: C.amber, marginBottom: 14 }}>🎰 OPTIONS BREAK-EVEN CALCULATOR</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 5 }}>TYPE</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setOptionType("call")}
                      style={{ flex: 1, fontFamily: MONO, fontSize: 12, fontWeight: 700, background: optionType === "call" ? C.green : C.surface, border: `1px solid ${optionType === "call" ? C.green : C.border}`, color: optionType === "call" ? "#fff" : C.textDim, borderRadius: 5, padding: "8px 0", cursor: "pointer" }}>CALL</button>
                    <button onClick={() => setOptionType("put")}
                      style={{ flex: 1, fontFamily: MONO, fontSize: 12, fontWeight: 700, background: optionType === "put" ? C.red : C.surface, border: `1px solid ${optionType === "put" ? C.red : C.border}`, color: optionType === "put" ? "#fff" : C.textDim, borderRadius: 5, padding: "8px 0", cursor: "pointer" }}>PUT</button>
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 5 }}>STRIKE PRICE</div>
                  <input type="number" value={optionStrike} onChange={e => setOptionStrike(e.target.value)} placeholder="150"
                    style={{ width: "100%", fontFamily: MONO, fontSize: 13, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "8px 10px", boxSizing: "border-box", outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 5 }}>PREMIUM PAID</div>
                  <input type="number" value={optionPremium} onChange={e => setOptionPremium(e.target.value)} placeholder="3.50"
                    style={{ width: "100%", fontFamily: MONO, fontSize: 13, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "8px 10px", boxSizing: "border-box", outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 5 }}>STOCK PRICE (opt)</div>
                  <input type="number" value={optionStock} onChange={e => setOptionStock(e.target.value)} placeholder="148"
                    style={{ width: "100%", fontFamily: MONO, fontSize: 13, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "8px 10px", boxSizing: "border-box", outline: "none" }} />
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginBottom: 5 }}>EXPIRY DATE (opt)</div>
                  <input type="date" value={optionExpiry} onChange={e => setOptionExpiry(e.target.value)}
                    style={{ width: "100%", fontFamily: MONO, fontSize: 12, background: C.surface, border: `1px solid ${C.border}`, color: C.text, borderRadius: 6, padding: "8px 10px", boxSizing: "border-box", outline: "none" }} />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button onClick={computeOptions}
                    style={{ width: "100%", fontFamily: MONO, fontSize: 12, fontWeight: 700, background: C.amber, border: "none", color: "#000", borderRadius: 6, padding: "10px 0", cursor: "pointer" }}>
                    CALCULATE
                  </button>
                </div>
              </div>
            </div>
            {optionResult && (() => {
              const { breakEven, intrinsic, timeValue, currentPnL, maxProfit, maxLoss, daysToExpiry, isCall } = optionResult;
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                    <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${C.accent}` }) }}>
                      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.accent }}>${breakEven.toFixed(2)}</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>BREAK-EVEN</div>
                    </div>
                    <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${C.green}` }) }}>
                      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.green }}>{isCall ? "Unlimited" : `$${maxProfit}`}</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>MAX PROFIT</div>
                    </div>
                    <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${C.red}` }) }}>
                      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: C.red }}>-${maxLoss}</div>
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>MAX LOSS</div>
                    </div>
                    {intrinsic != null && (
                      <div style={{ ...card({ padding: 18, textAlign: "center" }) }}>
                        <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.text }}>${intrinsic.toFixed(2)}</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>INTRINSIC VALUE</div>
                      </div>
                    )}
                    {timeValue != null && (
                      <div style={{ ...card({ padding: 18, textAlign: "center" }) }}>
                        <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: C.textSec }}>${timeValue.toFixed(2)}</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>TIME VALUE</div>
                      </div>
                    )}
                    {currentPnL != null && (
                      <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${currentPnL >= 0 ? C.green : C.red}` }) }}>
                        <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 900, color: currentPnL >= 0 ? C.green : C.red }}>{currentPnL >= 0 ? "+" : ""}${currentPnL.toFixed(0)}</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>CURRENT P&L</div>
                      </div>
                    )}
                    {daysToExpiry != null && (
                      <div style={{ ...card({ padding: 18, textAlign: "center", borderLeft: `4px solid ${daysToExpiry <= 7 ? C.red : daysToExpiry <= 21 ? C.amber : C.green}` }) }}>
                        <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 900, color: daysToExpiry <= 7 ? C.red : daysToExpiry <= 21 ? C.amber : C.green }}>{daysToExpiry}d</div>
                        <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim }}>DAYS TO EXPIRY</div>
                      </div>
                    )}
                  </div>
                  <div style={{ ...card({ padding: 16, borderLeft: `4px solid ${isCall ? C.green : C.red}` }) }}>
                    <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 8 }}>TRADE SUMMARY — {isCall ? "CALL" : "PUT"} ${optionStrike} @ ${optionPremium}</div>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
                      {isCall
                        ? `You paid $${optionPremium}/share ($${(parseFloat(optionPremium) * 100).toFixed(0)} per contract) for the right to BUY at $${optionStrike}. Stock must rise above $${breakEven.toFixed(2)} by expiry to profit.`
                        : `You paid $${optionPremium}/share ($${(parseFloat(optionPremium) * 100).toFixed(0)} per contract) for the right to SELL at $${optionStrike}. Stock must fall below $${breakEven.toFixed(2)} by expiry to profit.`}
                    </div>
                  </div>
                </div>
              );
            })()}
            {!optionResult && (
              <div style={{ ...card({ padding: 60, textAlign: "center" }) }}>
                <div style={{ fontFamily: MONO, fontSize: 32, marginBottom: 12 }}>🎰</div>
                <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: C.text }}>Enter option details and click CALCULATE</div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: C.textDim, marginTop: 6 }}>Computes break-even, max profit/loss, intrinsic value, time value, and P&L</div>
              </div>
            )}
          </div>
        );
}
